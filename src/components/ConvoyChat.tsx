import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Send, X, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: string;
  sender_name: string;
  sender_color: string;
  message: string;
  created_at: string;
  session_id: string;
}

interface ConvoyChatProps {
  convoyId: string;
  sessionId: string;
  senderName: string;
  senderColor: string;
}

const ConvoyChat = ({ convoyId, sessionId, senderName, senderColor }: ConvoyChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  // Fetch existing messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("convoy_messages")
        .select("*")
        .eq("convoy_id", convoyId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) {
        setMessages(data as Message[]);
        scrollToBottom();
      }
    };
    fetchMessages();
  }, [convoyId, scrollToBottom]);

  // Subscribe to new messages
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${convoyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "convoy_messages", filter: `convoy_id=eq.${convoyId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
          scrollToBottom();
          if (!isOpen && newMsg.session_id !== sessionId) {
            setUnread((u) => u + 1);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [convoyId, isOpen, sessionId, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");

    await supabase.from("convoy_messages").insert({
      convoy_id: convoyId,
      session_id: sessionId,
      sender_name: senderName,
      sender_color: senderColor,
      message: trimmed,
    });
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnread(0);
    scrollToBottom();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!isOpen) {
    return (
      <Button
        size="icon"
        variant="outline"
        className="absolute bottom-16 left-4 z-10 bg-card/90 backdrop-blur-xl border-border hover:bg-primary/20 hover:border-primary/50 relative"
        onClick={handleOpen}
        title="Open chat"
      >
        <MessageCircle className="w-5 h-5 text-primary" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="absolute bottom-16 left-4 z-10 w-80 max-h-96 bg-card/95 backdrop-blur-xl border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span className="font-display text-sm font-semibold text-foreground">Chat</span>
          <span className="text-[10px] text-muted-foreground">{messages.length} messages</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[250px]">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">No messages yet. Say hi!</p>
        )}
        {messages.map((msg) => {
          const isSelf = msg.session_id === sessionId;
          return (
            <div key={msg.id} className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
              {!isSelf && (
                <span className="text-[10px] font-display mb-0.5" style={{ color: msg.sender_color }}>
                  {msg.sender_name}
                </span>
              )}
              <div
                className={`rounded-lg px-3 py-1.5 max-w-[85%] text-sm ${
                  isSelf
                    ? "bg-primary/20 text-foreground"
                    : "bg-secondary/60 text-foreground"
                }`}
              >
                {msg.message}
              </div>
              <span className="text-[9px] text-muted-foreground mt-0.5">{formatTime(msg.created_at)}</span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-border flex gap-2">
        <Input
          placeholder="Message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm h-8"
          maxLength={500}
        />
        <Button
          size="icon"
          className="h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
          onClick={handleSend}
          disabled={!input.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default ConvoyChat;
