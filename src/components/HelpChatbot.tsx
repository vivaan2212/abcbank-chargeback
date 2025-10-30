import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowUp, MessageCircleQuestion } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import paceAvatar from "@/assets/pace-avatar.png";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface HelpChatbotProps {
  userName: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export const HelpChatbot = ({ userName, isExpanded, onToggle }: HelpChatbotProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "I'm here to help! Ask me any question about the current step or the onboarding process.",
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsSending(true);

    // Simulate AI response (replace with actual AI integration)
    setTimeout(() => {
      const assistantMessage: Message = {
        role: "assistant",
        content: "I'm here to help you with your dispute. Could you please provide more details about what you need assistance with?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsSending(false);
    }, 1000);
  };

  if (!isExpanded) {
    return (
      <div 
        onClick={onToggle}
        className="w-full bg-card border-t border-border px-6 py-3 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
      >
        <MessageCircleQuestion className="w-5 h-5 text-primary" />
        <span className="text-sm font-semibold">Have a question? Ask Pace right away.</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-background z-50 flex flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "assistant" ? "justify-start" : "justify-end"} animate-fade-in`}
            >
              <div className={`max-w-[70%] ${msg.role === "assistant" ? "items-start" : "items-end"} flex flex-col`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">Pace</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">Pace</span>
                  </div>
                )}
                
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    msg.role === "assistant"
                      ? "bg-[hsl(var(--chat-assistant-bg))] text-foreground rounded-tl-none"
                      : "bg-[hsl(var(--chat-user-bg))] text-[hsl(var(--chat-user-fg))] rounded-tr-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                </div>
                
                <span className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto space-y-3">
          <Textarea
            placeholder="Type your question..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isSending}
            className="resize-none text-sm min-h-[44px]"
            rows={1}
          />
          <div className="flex gap-3">
            <Button
              onClick={onToggle}
              variant="outline"
              className="flex-1 max-w-[200px]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={isSending || !inputMessage.trim()}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
