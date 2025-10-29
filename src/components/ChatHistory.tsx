import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteInProgressRef = useRef<Set<string>>(new Set());

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

  const openDeleteDialog = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!conversationToDelete || isDeleting) return;

    // Prevent duplicate requests
    if (deleteInProgressRef.current.has(conversationToDelete)) {
      console.log('Delete already in progress for:', conversationToDelete);
      return;
    }

    deleteInProgressRef.current.add(conversationToDelete);
    setIsDeleting(true);

    const conversationId = conversationToDelete;
    const originalConversations = [...conversations];
    const remainingConversations = conversations.filter(conv => conv.id !== conversationId);

    // Optimistically update UI
    setConversations(remainingConversations);
    setDeleteDialogOpen(false);

    // If deleted conversation was the current one
    if (currentConversationId === conversationId) {
      if (remainingConversations.length === 0) {
        sessionStorage.removeItem(`cb_active_chat_id::${(await supabase.auth.getUser()).data.user?.id}`);
        onNewChat();
      } else {
        const newActiveId = remainingConversations[0].id;
        sessionStorage.setItem(
          `cb_active_chat_id::${(await supabase.auth.getUser()).data.user?.id}`,
          newActiveId
        );
        onConversationSelect(newActiveId);
      }
    }

    try {
      await deleteConversationWithRetry(conversationId);
      toast.success("Chat deleted");
    } catch (error: any) {
      console.error('Delete failed:', error);
      toast.error("Couldn't delete. Try again.");
      // Rollback UI
      setConversations(originalConversations);
      if (currentConversationId === conversationId) {
        onConversationSelect(conversationId);
      }
    } finally {
      deleteInProgressRef.current.delete(conversationId);
      setIsDeleting(false);
      setConversationToDelete(null);
    }
  };

  const deleteConversationWithRetry = async (
    conversationId: string,
    attempt: number = 1
  ): Promise<void> => {
    const maxRetries = 3;
    const idempotencyKey = crypto.randomUUID();
    const timeout = 8000;

    const retryDelays = [0, 400, 1200]; // exponential backoff

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-conversation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({ conversationId }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      const result = await response.json();
      console.log('Delete succeeded:', result);
    } catch (error: any) {
      console.error(`Delete attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = retryDelays[attempt - 1] || 1200;
        await new Promise(resolve => setTimeout(resolve, delay));
        return deleteConversationWithRetry(conversationId, attempt + 1);
      }

      throw error;
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
                      onClick={(e) => openDeleteDialog(conversation.id, e)}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The conversation and all its messages will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatHistory;
