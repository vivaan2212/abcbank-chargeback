import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import paceAvatar from "@/assets/pace-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface HelpWidgetProps {
  onClose: () => void;
}

export const HelpWidget = ({ onClose }: HelpWidgetProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm Pace, your chargeback assistant. Ask me any question about the chargeback process, timelines, evidence requirements, or anything else related to disputes.",
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const question = inputMessage;
    setInputMessage("");
    setIsLoading(true);

    try {
      // Get conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call edge function to get AI-powered answer from knowledge base
      const { data: helpData, error: helpError } = await supabase.functions.invoke(
        'answer-help-question',
        {
          body: {
            question,
            conversationHistory
          }
        }
      );

      if (helpError) throw helpError;

      const assistantMessage: Message = {
        role: "assistant",
        content: helpData.answer || "I'm sorry, I couldn't find an answer to that question. Please try rephrasing or contact support for more help.",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Failed to get help:", error);
      toast.error("Failed to get answer. Please try again.");
      
      // Fallback response
      const fallbackMessage: Message = {
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again in a moment or contact support if the issue persists.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="w-8 h-8">
            <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">Pace</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold">Ask Pace</h2>
            <p className="text-xs text-muted-foreground">Chargeback Assistant</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div className={`max-w-[80%] ${msg.role === "assistant" ? "items-start" : "items-end"} flex flex-col`}>
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">Pace</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">Pace</span>
                    </div>
                  )}
                  
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      msg.role === "assistant"
                        ? "bg-muted text-foreground rounded-tl-none"
                        : "bg-primary text-primary-foreground rounded-tr-none"
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
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] items-start flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">Pace</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium">Pace</span>
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border px-6 py-4 space-y-3">
          <Textarea
            placeholder="Ask me anything about chargebacks..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isLoading}
            className="resize-none text-sm min-h-[80px]"
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Asking...
                </>
              ) : (
                "Ask Pace"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};