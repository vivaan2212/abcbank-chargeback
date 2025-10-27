import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Conversation {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

interface ChatHistoryProps {
  currentConversationId?: string;
  onConversationSelect: (id: string) => void;
  onNewChat: () => void;
}

const ChatHistory = ({ currentConversationId, onConversationSelect, onNewChat }: ChatHistoryProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    loadConversations();
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error: any) {
      toast.error("Failed to load chat history");
    }
  };

  return (
    <div className="w-64 border-r border-border bg-card flex flex-col h-screen">
      <div className="p-4 border-b border-border">
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-1">ABC Bank</h2>
          <p className="text-xs text-muted-foreground">powered by Pace</p>
        </div>
        
        <Button
          onClick={onNewChat}
          className="w-full"
          variant="default"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-muted-foreground">Chat History</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onConversationSelect(conversation.id)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                currentConversationId === conversation.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conversation.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                    conversation.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {conversation.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatHistory;
