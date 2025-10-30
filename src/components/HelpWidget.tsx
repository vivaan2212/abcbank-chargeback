import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const addClosingMessage = (setMessages: React.Dispatch<React.SetStateAction<Message[]>>) => {
  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: "Hope I answered your questions, now let's get back to helping you raise a dispute!",
      timestamp: new Date(),
    }
  ]);
};

export const HelpWidget = ({ onClose, messages, setMessages }: HelpWidgetProps) => {
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
    <div className="mt-6 animate-fade-in">
      {/* Messages */}
      <div className="space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx}>
            {msg.role === "assistant" && (
              <div className="flex items-start gap-3">
                <Avatar className="w-10 h-10 flex-shrink-0">
                  <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                  <AvatarFallback className="bg-primary text-primary-foreground">P</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">Pace</span>
                  </div>
                  <div className="bg-muted rounded-lg rounded-tl-none px-4 py-3">
                    <p className="text-sm text-foreground">{msg.content}</p>
                  </div>
                </div>
              </div>
            )}
            
            {msg.role === "user" && (
              <div className="flex items-start gap-3 justify-end">
                <div className="flex-1 flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-4 py-3 max-w-[80%]">
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex items-start gap-3">
            <Avatar className="w-10 h-10 flex-shrink-0">
              <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
              <AvatarFallback className="bg-primary text-primary-foreground">P</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">Pace</span>
              </div>
              <div className="bg-muted rounded-lg rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-6 space-y-3">
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
          disabled={isLoading}
          className="resize-none text-sm min-h-[80px] bg-background"
          rows={3}
        />
        <div className="flex gap-3">
          <Button
            onClick={() => {
              addClosingMessage(setMessages);
              setTimeout(() => onClose(), 100);
            }}
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
                Sending...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};