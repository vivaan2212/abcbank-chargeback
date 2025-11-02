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

  const stripHtml = (html: string): string => {
    // Remove HTML tags and decode common entities
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  };

  const findDifferences = (previous: string, updated: string) => {
    // Strip HTML first
    const cleanPrevious = stripHtml(previous);
    const cleanUpdated = stripHtml(updated);
    
    // Split into sentences for comparison
    const prevSentences = cleanPrevious.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const updatedSentences = cleanUpdated.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    
    // Find added content (in updated but not in previous)
    const added = updatedSentences.filter(s => 
      !prevSentences.some(ps => ps.trim() === s.trim())
    ).slice(0, 3); // Limit to first 3 additions
    
    // Find removed content (in previous but not in updated)
    const removed = prevSentences.filter(s => 
      !updatedSentences.some(us => us.trim() === s.trim())
    ).slice(0, 3); // Limit to first 3 removals
    
    // Generate summary
    let summary = "";
    if (added.length > 0 && removed.length > 0) {
      summary = `Modified content: ${added.length} addition(s), ${removed.length} removal(s)`;
    } else if (added.length > 0) {
      summary = `Added ${added.length} new section(s)`;
    } else if (removed.length > 0) {
      summary = `Removed ${removed.length} section(s)`;
    } else {
      summary = "Minor text modifications";
    }
    
    return { summary, added, removed };
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
          const { summary, added, removed } = findDifferences(
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
                    <p className="text-[10px] text-muted-foreground">
                      Updated by Adam Smith
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
                  {added.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 mb-2">
                        ✓ Added Content:
                      </p>
                      <div className="space-y-2">
                        {added.map((sentence, idx) => (
                          <div 
                            key={idx}
                            className="text-[10px] bg-green-50 dark:bg-green-950/30 border-l-2 border-green-500 rounded p-2 max-h-32 overflow-auto"
                          >
                            {sentence}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {removed.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-2">
                        ✗ Removed Content:
                      </p>
                      <div className="space-y-2">
                        {removed.map((sentence, idx) => (
                          <div 
                            key={idx}
                            className="text-[10px] bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 rounded p-2 max-h-32 overflow-auto line-through opacity-75"
                          >
                            {sentence}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {added.length === 0 && removed.length === 0 && (
                    <div className="border-t pt-3">
                      <p className="text-[10px] text-muted-foreground text-center py-2">
                        Minor text modifications detected
                      </p>
                    </div>
                  )}
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
