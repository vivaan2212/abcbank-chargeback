import { BookOpen, X, ArrowUp, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import KnowledgeBaseChat from "./KnowledgeBaseChat";

interface KnowledgeBasePanelProps {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
}

const KnowledgeBasePanel = ({ isOpen, isClosing, onClose }: KnowledgeBasePanelProps) => {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [content, setContent] = useState<string>("");
  const [isLoadingContent, setIsLoadingContent] = useState(true);

  const fetchKnowledgeBase = async () => {
    setIsLoadingContent(true);
    const { data, error } = await supabase
      .from('knowledge_base_content')
      .select('content, updated_at')
      .eq('section_key', 'chargeback_for_banks')
      .single();

    if (!error && data) {
      setContent(data.content);
      setLastUpdated(new Date(data.updated_at));
    } else {
      console.error('Error fetching knowledge base:', error);
    }
    setIsLoadingContent(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchKnowledgeBase();
    }
  }, [isOpen]);

  const handleUpdateSuccess = () => {
    // Refresh the content and timestamp
    fetchKnowledgeBase();
    toast.success('Knowledge base has been updated');
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setIsLoading(true);
    setAnswer("");

    try {
      const { data, error } = await supabase.functions.invoke('query-knowledge-base', {
        body: { question }
      });

      if (error) throw error;

      setAnswer(data.answer);
    } catch (error) {
      console.error('Error asking question:', error);
      toast.error('Failed to get answer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dark Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-40",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={onClose}
      />
      
      {/* Sliding Panel */}
      <div className={cn(
        "fixed top-0 right-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-background z-50 shadow-2xl overflow-hidden flex flex-col",
        isClosing ? "animate-slide-out-right" : "animate-slide-in-right"
      )}>
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5" />
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold">Knowledge Base</h2>
              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-6">
          {isLoadingContent ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-sm text-muted-foreground">Loading knowledge base...</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl space-y-6 prose prose-sm max-w-none">
              <div 
                className="text-xs leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:mb-1 [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:mb-4 [&_ul]:text-xs [&_ul]:text-muted-foreground [&_ul]:space-y-1 [&_ol]:text-xs [&_ol]:text-muted-foreground [&_ol]:space-y-3 [&_li]:text-xs [&_strong]:text-foreground"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          )}

          {/* AI Question Interface at Bottom */}
          <div className="border-t px-6 py-4 bg-muted/30">
            <div className="mb-3">
              {answer && (
                <div className="mb-4 p-4 bg-background rounded-lg border">
                  <p className="text-xs font-semibold mb-2">Answer:</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{answer}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-background rounded-lg border px-4 py-2">
                <span className="text-xl">⚡</span>
                <Input
                  type="text"
                  placeholder="Ask anything to ⚡ Pace"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                  className="flex-1 bg-transparent border-0 outline-none text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 flex-shrink-0 rounded-full hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                  onClick={handleAskQuestion}
                  disabled={isLoading || !question.trim()}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsChatOpen(true)}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Chat Modal */}
      <KnowledgeBaseChat 
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onUpdateSuccess={handleUpdateSuccess}
      />
    </>
  );
};

export default KnowledgeBasePanel;
