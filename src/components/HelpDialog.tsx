import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import paceAvatar from "@/assets/pace-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LoadingText } from "@/components/LoadingText";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onResumeQuestion?: () => void;
}

export const HelpDialog = ({ open, onOpenChange, messages, setMessages, onResumeQuestion }: HelpDialogProps) => {
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [isUpdateFlow, setIsUpdateFlow] = useState(false);

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
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      if (isUpdateFlow) {
        const { data: updateData, error: updateError } = await supabase.functions.invoke(
          'log-transaction-update',
          {
            body: {
              userInput: question,
              conversationHistory
            }
          }
        );

        if (updateError) throw updateError;

        const assistantMessage: Message = {
          role: "assistant",
          content: updateData.response,
          timestamp: new Date(),
        };
        
        setMessages((prev) => [...prev, assistantMessage]);

        if (updateData.completed) {
          setIsUpdateFlow(false);
          setShowFollowUp(true);
        }
      } else {
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

        if (helpData.isUpdateFlow) {
          setIsUpdateFlow(true);
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: helpData.answer || "I'm sorry, I couldn't find an answer to that question. Please try rephrasing or contact support for more help.",
          timestamp: new Date(),
        };
        
        setMessages((prev) => [...prev, assistantMessage]);
        
        if (!helpData.isUpdateFlow) {
          setTimeout(() => {
            const followUpMessage: Message = {
              role: "assistant",
              content: "Do you have any other questions?",
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, followUpMessage]);
            setShowFollowUp(true);
          }, 500);
        }
      }
    } catch (error: any) {
      console.error("Failed to get help:", error);
      toast.error("Failed to get answer. Please try again.");
      
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

  const handleFollowUpResponse = (hasMoreQuestions: boolean) => {
    if (hasMoreQuestions) {
      setShowFollowUp(false);
    } else {
      const closingMessage: Message = {
        role: "assistant",
        content: "I hope I have answered your questions well. Let's get back to helping you raise a dispute!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, closingMessage]);
      setShowFollowUp(false);
      
      setTimeout(() => {
        onOpenChange(false);
        onResumeQuestion?.();
      }, 1500);
    }
  };

  const handleContinue = () => {
    const closingMessage: Message = {
      role: "assistant",
      content: "Hope I answered your questions, now let's get back to helping you raise a dispute!",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, closingMessage]);
    setTimeout(() => onOpenChange(false), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">P</AvatarFallback>
            </Avatar>
            Ask Pace
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 pb-4">
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <Avatar className="w-8 h-8 mr-2 flex-shrink-0">
                    <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">P</AvatarFallback>
                  </Avatar>
                )}
                <div 
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-tr-none" 
                      : "bg-muted rounded-tl-none"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start gap-2">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">P</AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg rounded-tl-none px-4 py-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground"><LoadingText /></span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-6 pt-4 border-t space-y-3">
          {showFollowUp ? (
            <div className="flex gap-3">
              <Button
                onClick={() => handleFollowUpResponse(true)}
                className="flex-1"
              >
                Yes
              </Button>
              <Button
                onClick={() => handleFollowUpResponse(false)}
                variant="outline"
                className="flex-1"
              >
                No
              </Button>
            </div>
          ) : (
            <>
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
                className="resize-none text-sm min-h-[80px]"
                rows={3}
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleContinue}
                  variant="outline"
                  className="flex-1"
                >
                  Continue
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
                    "Send"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
