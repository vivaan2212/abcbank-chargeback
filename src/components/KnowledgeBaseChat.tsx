import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getUserRole } from "@/lib/auth";

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
  initialInput?: string;
}

const KnowledgeBaseChat = ({ isOpen, onClose, onUpdateSuccess, initialInput }: KnowledgeBaseChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<'customer' | 'bank_admin' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Set initial input if provided
  useEffect(() => {
    if (initialInput && input === "") {
      setInput(initialInput);
    }
  }, [initialInput]);

  useEffect(() => {
    const checkUserRole = async () => {
      if (isOpen) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const role = await getUserRole(user.id);
          setUserRole(role);
        }
      }
    };
    
    if (isOpen && messages.length === 0) {
      checkUserRole();
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
    const userInput = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      // Check if this is an update request
      const isUpdateRequest = /update|change|modify|edit|revise|add|remove/i.test(userInput);

      if (isUpdateRequest) {
        // Check permissions first
        if (userRole !== 'bank_admin') {
          const deniedMessage: Message = {
            id: `system-${Date.now()}`,
            role: "system",
            content: "You don't have permission to update the knowledge base. Only bank administrators can make changes.",
            timestamp: new Date()
          };
          setMessages(prev => [...prev, deniedMessage]);
          setIsLoading(false);
          return;
        }

        // User has permission - show confirmation and execute update
        const confirmMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "I'll update the knowledge base with your requested changes.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmMessage]);

        // Execute the update
        await handleConfirmUpdate(userInput);
      } else {
        // Regular query
        const { data, error } = await supabase.functions.invoke('query-knowledge-base', {
          body: { 
            question: userInput,
            isUpdateRequest: false
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

    try {
      const { data, error } = await supabase.functions.invoke('update-knowledge-base', {
        body: {
          section_key: 'chargeback_for_banks',
          new_content: newContent
        }
      });

      if (error) {
        throw error;
      }

      const successMessage: Message = {
        id: `success-${Date.now()}`,
        role: "system",
        content: `✅ Knowledge base updated successfully!`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, successMessage]);
      toast.success('Knowledge base updated');
      
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
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-background mb-4">
        <div className="flex items-center gap-2">
          <img 
            src="/src/assets/pace-avatar.png" 
            alt="Pace" 
            className="h-8 w-8 rounded-full"
          />
          <h3 className="font-semibold text-sm">Update Knowledge Base</h3>
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
                  <img 
                    src="/src/assets/pace-avatar.png" 
                    alt="Pace" 
                    className="h-8 w-8 rounded-full"
                  />
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
                  <span className="text-xs text-primary-foreground font-semibold">You</span>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <img 
                  src="/src/assets/pace-avatar.png" 
                  alt="Pace" 
                  className="h-8 w-8 rounded-full"
                />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-background">
          <div className="flex items-center gap-3 bg-muted/50 rounded-full border px-5 py-3">
            <img 
              src="/src/assets/pace-avatar.png" 
              alt="Pace" 
              className="h-6 w-6 rounded-full flex-shrink-0"
            />
            <Input
              type="text"
              placeholder="Type your update request..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 outline-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
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
    );
  };

export default KnowledgeBaseChat;
