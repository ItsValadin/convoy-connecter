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

export const useWalkieTalkie = ({ convoyId, sessionId, senderName, senderColor }: WalkieTalkieOptions) => {
  const [recording, setRecording] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Subscribe to walkie-talkie channel
  useEffect(() => {
    if (!convoyId) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
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
        // Auto-clear after timeout in case ptt_end is missed
        if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
        speakerTimerRef.current = setTimeout(() => setActiveSpeaker(null), MAX_RECORD_MS + 2000);
      })
      .on("broadcast", { event: "ptt_end" }, ({ payload }) => {
        if (payload.session_id === sessionId) return;
        setActiveSpeaker(null);
      })
      .on("broadcast", { event: "ptt_audio" }, ({ payload }) => {
        if (payload.session_id === sessionId) return;
        playAudioBase64(payload.audio, payload.mimeType);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [convoyId, sessionId]);

  const playAudioBase64 = useCallback((base64: string, mimeType: string) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch((e) => console.error("Audio playback failed:", e));
    } catch (e) {
      console.error("Failed to decode audio:", e);
    }
  }, []);

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

      // Prefer opus/webm for small size, fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Convert to base64 and broadcast
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          // Strip the data:xxx;base64, prefix
          const base64 = dataUrl.split(",")[1];
          if (base64 && channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "ptt_audio",
              payload: {
                session_id: sessionId,
                name: senderName,
                audio: base64,
                mimeType,
              },
            });
          }
        };
        reader.readAsDataURL(blob);

        // Broadcast end
        channelRef.current?.send({
          type: "broadcast",
          event: "ptt_end",
          payload: { session_id: sessionId },
        });
      };

      // Broadcast start
      channelRef.current?.send({
        type: "broadcast",
        event: "ptt_start",
        payload: {
          session_id: sessionId,
          name: senderName,
          color: senderColor,
        },
      });

      recorder.start(500); // collect in 500ms chunks for streaming feel
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
  }, [convoyId, recording, activeSpeaker, sessionId, senderName, senderColor]);

  const stopRecording = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
    };
  }, []);

  return {
    recording,
    activeSpeaker,
    startRecording,
    stopRecording,
  };
};
