import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Get remaining conversations after deletion
    const remainingConversations = conversations.filter(conv => conv.id !== conversationId);
    
    // Immediately remove from UI
    setConversations(remainingConversations);
    
    // If deleted conversation was the current one
    if (currentConversationId === conversationId) {
      // Only create new chat if no other conversations exist
      if (remainingConversations.length === 0) {
        onNewChat();
      } else {
        // Select the first available conversation
        onConversationSelect(remainingConversations[0].id);
      }
    }
    
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;

      toast.success("Conversation deleted");
    } catch (error: any) {
      toast.error("Failed to delete conversation");
      // Reload on error to restore accurate state
      loadConversations();
    }
  };

  return (
    <div className="w-full border-r border-border bg-card flex flex-col h-full">
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
            <div
              key={conversation.id}
              className={`group relative w-full rounded-lg mb-1 transition-all ${
                currentConversationId === conversation.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/50"
              }`}
            >
              <button
                onClick={() => onConversationSelect(conversation.id)}
                className="w-full text-left p-3 pr-12"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conversation.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
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
              
              <div
                className={`absolute right-2 top-2 transition-opacity ${
                  currentConversationId === conversation.id
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                }`}
             >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-background/50"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Conversation actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="z-50 bg-popover text-popover-foreground border border-border shadow-md"
                  >
                    <DropdownMenuItem
                      onClick={(e) => handleDeleteConversation(conversation.id, e)}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatHistory;
