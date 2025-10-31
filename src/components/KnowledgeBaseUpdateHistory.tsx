import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Update {
  id: string;
  created_at: string;
  updated_by: string;
  section_key: string;
  previous_content: string;
  new_content: string;
}

const KnowledgeBaseUpdateHistory = () => {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedUpdate, setExpandedUpdate] = useState<string | null>(null);

  useEffect(() => {
    fetchUpdates();
  }, []);

  const fetchUpdates = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_base_updates')
      .select('*')
      .eq('section_key', 'chargeback_for_banks')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setUpdates(data);
    }
    setIsLoading(false);
  };

  const extractChangeSummary = (previous: string, updated: string) => {
    // Simple heuristic to identify what changed
    const prevLength = previous.length;
    const newLength = updated.length;
    const diff = newLength - prevLength;
    
    if (diff > 0) {
      return `Added ~${diff} characters of content`;
    } else if (diff < 0) {
      return `Removed ~${Math.abs(diff)} characters`;
    } else {
      return "Content modified";
    }
  };

  const highlightDifferences = (previous: string, updated: string) => {
    // Extract meaningful snippets showing what was added
    const prevWords = previous.toLowerCase().split(/\s+/).slice(0, 100);
    const newWords = updated.toLowerCase().split(/\s+/).slice(0, 100);
    
    // Find new sections in updated content
    const updatedPreview = updated.substring(0, 500);
    
    return {
      summary: extractChangeSummary(previous, updated),
      preview: updatedPreview
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        No update history available yet.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {updates.map((update) => {
          const { summary, preview } = highlightDifferences(
            update.previous_content,
            update.new_content
          );
          const isExpanded = expandedUpdate === update.id;

          return (
            <div
              key={update.id}
              className="border rounded-lg p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1">
                  <History className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {summary}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setExpandedUpdate(isExpanded ? null : update.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3">
                  <div className="border-t pt-3">
                    <p className="text-[10px] font-semibold text-foreground mb-2">
                      Content Preview:
                    </p>
                    <div 
                      className="text-[10px] text-muted-foreground bg-background rounded p-2 max-h-40 overflow-auto"
                      dangerouslySetInnerHTML={{ 
                        __html: preview.replace(/</g, '&lt;').replace(/>/g, '&gt;') 
                      }}
                    />
                  </div>
                  
                  <div className="border-t pt-3">
                    <p className="text-[10px] font-semibold text-foreground mb-2">
                      Change Statistics:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-background rounded p-2">
                        <span className="text-muted-foreground">Previous:</span>
                        <span className="ml-2 font-mono">{update.previous_content.length} chars</span>
                      </div>
                      <div className="bg-background rounded p-2">
                        <span className="text-muted-foreground">Updated:</span>
                        <span className="ml-2 font-mono">{update.new_content.length} chars</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};

export default KnowledgeBaseUpdateHistory;
