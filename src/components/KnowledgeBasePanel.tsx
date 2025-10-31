import { BookOpen, X, ArrowUp, MessageSquare, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import KnowledgeBaseChat from "./KnowledgeBaseChat";
import KnowledgeBaseUpdateHistory from "./KnowledgeBaseUpdateHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface KnowledgeBasePanelProps {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
}

const KnowledgeBasePanel = ({ isOpen, isClosing, onClose }: KnowledgeBasePanelProps) => {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [content, setContent] = useState<string>("");
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);

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
    if (!chatInput.trim()) return;

    setIsLoadingAnswer(true);
    setAnswer("");

    try {
      const { data, error } = await supabase.functions.invoke('query-knowledge-base', {
        body: { question: chatInput }
      });

      if (error) throw error;

      setAnswer(data.answer);
    } catch (error) {
      console.error('Error asking question:', error);
      toast.error('Failed to get answer. Please try again.');
    } finally {
      setIsLoadingAnswer(false);
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
        "fixed top-0 right-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-background z-50 shadow-2xl overflow-hidden flex flex-col relative",
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
          {/* Answer Display Area */}
          {answer && (
            <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20 animate-fade-in">
              <div className="flex items-start gap-3">
                <img 
                  src="/src/assets/pace-avatar.png" 
                  alt="Pace" 
                  className="h-8 w-8 rounded-full flex-shrink-0 mt-1"
                />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground mb-2">Pace's Answer:</p>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{answer}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setAnswer("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          <Tabs defaultValue="content" className="h-full flex flex-col">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
              <TabsTrigger value="content" className="text-xs">
                <BookOpen className="h-3 w-3 mr-2" />
                Content
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                <History className="h-3 w-3 mr-2" />
                Update History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-0 flex-1 overflow-auto">
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
            </TabsContent>

            <TabsContent value="history" className="mt-0 flex-1 overflow-auto">
              <KnowledgeBaseUpdateHistory />
            </TabsContent>
          </Tabs>
        </div>

        {/* AI Question Interface at Bottom */}
        <div className="border-t px-6 py-4 bg-background">
          <div className="flex items-center gap-3 bg-muted/50 rounded-full border px-5 py-3 hover:bg-muted/70 transition-colors">
            <img 
              src="/src/assets/pace-avatar.png" 
              alt="Pace" 
              className="h-6 w-6 rounded-full flex-shrink-0"
            />
            <Input
              type="text"
              placeholder="Ask anything to Pace"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoadingAnswer}
              className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {isLoadingAnswer ? (
              <div className="h-8 w-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              </div>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full hover:bg-primary/10 flex-shrink-0"
                onClick={handleAskQuestion}
                disabled={!chatInput.trim()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsChatOpen(true)}
              className="gap-2 rounded-full px-4 py-2 h-8"
            >
              Update KB
            </Button>
          </div>
        </div>

        {/* Chat Overlay - Positioned within the panel */}
        {isChatOpen && (
          <>
            {/* Backdrop within panel */}
            <div 
              className="absolute inset-0 bg-black/30 z-10 animate-fade-in"
              onClick={() => setIsChatOpen(false)}
            />
            
            {/* Chat Modal - Right side overlay */}
            <div className="absolute top-0 right-0 bottom-0 w-full md:w-2/3 bg-background z-20 shadow-2xl flex flex-col animate-slide-in-right">
              <KnowledgeBaseChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onUpdateSuccess={handleUpdateSuccess}
                initialInput={chatInput}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default KnowledgeBasePanel;
