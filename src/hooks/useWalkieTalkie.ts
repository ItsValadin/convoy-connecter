import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RealtimeChannel } from "@supabase/supabase-js";

interface WalkieTalkieOptions {
  convoyId: string | null;
  sessionId: string;
  senderName: string;
  senderColor: string;
}

interface ActiveSpeaker {
  sessionId: string;
  name: string;
  color: string;
}

const MAX_RECORD_MS = 15000; // 15s max recording
const CHUNK_MS = 500;
const MAX_PLAYBACK_BACKLOG_S = 1.2;

const base64ToUint8Array = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const uint8ToArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

export const useWalkieTalkie = ({ convoyId, sessionId, senderName, senderColor }: WalkieTalkieOptions) => {
  const [recording, setRecording] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nextPlaybackTimeRef = useRef(0);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const streamAppenderRef = useRef<((chunk: Uint8Array) => void) | null>(null);
  const streamTeardownRef = useRef<(() => void) | null>(null);
  const streamTeardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamMimeTypeRef = useRef<string | null>(null);

  const teardownStreamPlayback = useCallback(() => {
    if (streamTeardownTimerRef.current) {
      clearTimeout(streamTeardownTimerRef.current);
      streamTeardownTimerRef.current = null;
    }

    streamAppenderRef.current = null;
    streamMimeTypeRef.current = null;
    streamTeardownRef.current?.();
    streamTeardownRef.current = null;
  }, []);

  const setupStreamPlayback = useCallback((mimeType: string) => {
    if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(mimeType)) {
      return false;
    }

    if (streamMimeTypeRef.current === mimeType && streamAppenderRef.current) {
      return true;
    }

    teardownStreamPlayback();

    const mediaSource = new MediaSource();
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(mediaSource);
    audio.src = objectUrl;
    audio.autoplay = true;
    audio.preload = "auto";

    let sourceBuffer: SourceBuffer | null = null;
    let disposed = false;
    const queue: ArrayBuffer[] = [];

    const flush = () => {
      if (disposed || !sourceBuffer || sourceBuffer.updating || queue.length === 0) return;
      try {
        sourceBuffer.appendBuffer(queue.shift()!);
      } catch (error) {
        console.error("PTT stream append failed:", error);
      }
    };

    const onUpdateEnd = () => flush();

    const onSourceOpen = () => {
      if (disposed || mediaSource.readyState !== "open") return;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.mode = "sequence";
        sourceBuffer.addEventListener("updateend", onUpdateEnd);
        flush();
      } catch (error) {
        console.error("PTT source buffer setup failed:", error);
        teardownStreamPlayback();
      }
    };

    mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
    audio.play().catch(() => undefined);

    streamMimeTypeRef.current = mimeType;
    streamAppenderRef.current = (chunk: Uint8Array) => {
      if (disposed) return;
      queue.push(uint8ToArrayBuffer(chunk));
      flush();
    };

    streamTeardownRef.current = () => {
      if (disposed) return;
      disposed = true;
      sourceBuffer?.removeEventListener("updateend", onUpdateEnd);
      try {
        if (mediaSource.readyState === "open" && sourceBuffer && !sourceBuffer.updating) {
          mediaSource.endOfStream();
        }
      } catch {
        // Ignore stream close errors
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    return true;
  }, [teardownStreamPlayback]);

  const playFallbackAudio = useCallback(async (bytes: Uint8Array, mimeType: string) => {
    const stableBytes = Uint8Array.from(bytes);
    const blob = new Blob([stableBytes], { type: mimeType });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });

    URL.revokeObjectURL(url);
  }, []);

  const queueIncomingAudio = useCallback((base64: string, mimeType: string) => {
    const bytes = base64ToUint8Array(base64);

    if (setupStreamPlayback(mimeType) && streamAppenderRef.current) {
      if (streamTeardownTimerRef.current) {
        clearTimeout(streamTeardownTimerRef.current);
        streamTeardownTimerRef.current = null;
      }
      streamAppenderRef.current(bytes);
      return;
    }

    playbackQueueRef.current = playbackQueueRef.current
      .then(async () => {
        const ctx = audioContextRef.current ?? new AudioContext({ latencyHint: "interactive" });
        audioContextRef.current = ctx;

        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            // Ignore and attempt fallback below
          }
        }

        try {
          const audioBuffer = await ctx.decodeAudioData(uint8ToArrayBuffer(bytes));
          const now = ctx.currentTime;

          if (nextPlaybackTimeRef.current < now) {
            nextPlaybackTimeRef.current = now + 0.02;
          }

          // If backlog grows, catch up to near-live audio.
          if (nextPlaybackTimeRef.current - now > MAX_PLAYBACK_BACKLOG_S) {
            nextPlaybackTimeRef.current = now + 0.02;
          }

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.start(nextPlaybackTimeRef.current);
          nextPlaybackTimeRef.current += audioBuffer.duration;
          return;
        } catch {
          await playFallbackAudio(bytes, mimeType);
        }
      })
      .catch((e) => {
        console.error("PTT playback queue error:", e);
      });
  }, [playFallbackAudio, setupStreamPlayback]);

  const stopRecording = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  // Subscribe to walkie-talkie channel
  useEffect(() => {
    if (!convoyId) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      teardownStreamPlayback();
      return;
    }

    channelRef.current = supabase
      .channel(`walkie-${convoyId}`)
      .on("broadcast", { event: "ptt_start" }, ({ payload }) => {
        if (payload.session_id === sessionId) return;
        setActiveSpeaker({
          sessionId: payload.session_id,
          name: payload.name,
          color: payload.color,
        });
        teardownStreamPlayback();
        nextPlaybackTimeRef.current = 0;
        // Auto-clear after timeout in case ptt_end is missed
        if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
        speakerTimerRef.current = setTimeout(() => setActiveSpeaker(null), MAX_RECORD_MS + 2000);
      })
      .on("broadcast", { event: "ptt_end" }, ({ payload }) => {
        if (payload.session_id === sessionId) return;
        setActiveSpeaker(null);
        nextPlaybackTimeRef.current = 0;
        if (streamTeardownTimerRef.current) clearTimeout(streamTeardownTimerRef.current);
        streamTeardownTimerRef.current = setTimeout(() => teardownStreamPlayback(), 1000);
      })
      .on("broadcast", { event: "ptt_audio" }, ({ payload }) => {
        if (payload.session_id === sessionId) return;
        queueIncomingAudio(payload.audio, payload.mimeType ?? "audio/webm");
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      teardownStreamPlayback();
    };
  }, [convoyId, sessionId, queueIncomingAudio, teardownStreamPlayback]);

  const startRecording = useCallback(async () => {
    if (!convoyId || recording) return;

    // Check if someone else is talking
    if (activeSpeaker) {
      toast.error(`${activeSpeaker.name} is talking`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer Opus codecs for low-latency speech quality.
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const selectedMimeType = recorder.mimeType || mimeType || "audio/ogg";
      mediaRecorderRef.current = recorder;
      sendQueueRef.current = Promise.resolve();

      recorder.onstart = () => {
        // Broadcast start only after recorder is actually running
        channelRef.current?.send({
          type: "broadcast",
          event: "ptt_start",
          payload: {
            session_id: sessionId,
            name: senderName,
            color: senderColor,
          },
        });
      };

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          sendQueueRef.current = sendQueueRef.current
            .then(async () => {
              const base64 = arrayBufferToBase64(await e.data.arrayBuffer());
              if (!base64 || !channelRef.current) return;
              await channelRef.current.send({
                type: "broadcast",
                event: "ptt_audio",
                payload: {
                  session_id: sessionId,
                  name: senderName,
                  audio: base64,
                  mimeType: selectedMimeType,
                },
              });
            })
            .catch((err) => {
              console.error("PTT chunk send failed:", err);
            });
        }
      };

      recorder.onerror = (event) => {
        console.error("PTT recorder error:", event);
        toast.error("Microphone stream interrupted");
        setRecording(false);
      };

      recorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // Broadcast end
        channelRef.current?.send({
          type: "broadcast",
          event: "ptt_end",
          payload: { session_id: sessionId },
        });
      };

      recorder.start(CHUNK_MS);
      setRecording(true);

      // Auto-stop after max duration
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        toast.error("Microphone permission denied");
      } else {
        toast.error("Could not access microphone");
      }
      console.error("Mic error:", e);
    }
  }, [convoyId, recording, activeSpeaker, sessionId, senderName, senderColor, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
      if (streamTeardownTimerRef.current) clearTimeout(streamTeardownTimerRef.current);
      teardownStreamPlayback();
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [teardownStreamPlayback]);

  return {
    recording,
    activeSpeaker,
    startRecording,
    stopRecording,
  };
};
