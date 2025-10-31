import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface KnowledgeBaseChatProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateSuccess?: () => void;
}

const KnowledgeBaseChat = ({ isOpen, onClose, onUpdateSuccess }: KnowledgeBaseChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{ content: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Add welcome message
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hi! I'm Pace, your Knowledge Base assistant. Ask me anything about the Chargeback for Banks system, or request updates if you have the necessary permissions.",
          timestamp: new Date()
        }
      ]);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Check if this is an update request
      const isUpdateRequest = /update|change|modify|edit|revise/i.test(input);

      const { data, error } = await supabase.functions.invoke('query-knowledge-base', {
        body: { 
          question: input,
          isUpdateRequest 
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If it's an update request, check user permissions and show confirmation
      if (isUpdateRequest) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'bank_admin')
            .single();

          if (userRole) {
            // User has permissions - ask for update details
            setTimeout(() => {
              const followUpMessage: Message = {
                id: `system-${Date.now()}`,
                role: "system",
                content: "You have permission to update the knowledge base. Please provide the new content you'd like to add or the specific changes you'd like to make.",
                timestamp: new Date()
              };
              setMessages(prev => [...prev, followUpMessage]);
            }, 500);
          } else {
            // User doesn't have permissions
            setTimeout(() => {
              const deniedMessage: Message = {
                id: `system-${Date.now()}`,
                role: "system",
                content: "You don't have permission to update the knowledge base. Only bank administrators can make changes.",
                timestamp: new Date()
              };
              setMessages(prev => [...prev, deniedMessage]);
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmUpdate = async (newContent: string) => {
    if (!newContent.trim()) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('update-knowledge-base', {
        body: {
          section_key: 'chargeback_for_banks',
          new_content: newContent
        }
      });

      if (error) {
        if (error.message?.includes('permission')) {
          toast.error('You do not have permission to update the knowledge base');
        } else {
          throw error;
        }
        return;
      }

      const successMessage: Message = {
        id: `success-${Date.now()}`,
        role: "system",
        content: `✅ Knowledge base updated successfully! The changes are now live.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, successMessage]);
      toast.success('Knowledge base updated successfully');
      setPendingUpdate(null);
      
      // Notify parent component
      if (onUpdateSuccess) {
        onUpdateSuccess();
      }
    } catch (error) {
      console.error('Error updating knowledge base:', error);
      toast.error('Failed to update knowledge base');
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: "Failed to update the knowledge base. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Chat Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[600px] bg-background rounded-lg shadow-2xl z-50 flex flex-col animate-scale-in">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="font-semibold">Chat with Pace</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role !== "user" && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">⚡</span>
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "system"
                    ? "bg-muted border border-border"
                    : "bg-muted"
                )}
              >
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <span className="text-[10px] opacity-60 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm text-primary-foreground">You</span>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">⚡</span>
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg border px-4 py-2">
            <Input
              type="text"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 outline-none text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8 flex-shrink-0 rounded-full hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default KnowledgeBaseChat;
