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

  const fetchLastUpdated = async () => {
    const { data, error } = await supabase
      .from('knowledge_base_content')
      .select('updated_at')
      .eq('section_key', 'chargeback_for_banks')
      .single();

    if (!error && data) {
      setLastUpdated(new Date(data.updated_at));
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLastUpdated();
    }
  }, [isOpen]);

  const handleUpdateSuccess = () => {
    // Refresh the last updated timestamp
    fetchLastUpdated();
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
          <div className="max-w-3xl space-y-6">
            {/* Main Title */}
            <div>
              <h1 className="text-lg font-bold mb-4">Chargeback for Banks</h1>
              
              <p className="text-muted-foreground leading-relaxed mb-6 text-xs">
                This agent automates the end-to-end chargeback filing process by eliminating manual case review, 
                reducing human error in dispute categorization, and ensuring timely, compliant submissions across 
                card networks. It processes high-volume transaction and dispute data, identifies eligible chargebacks, 
                compiles supporting evidence, and files them accurately within network timelines — enabling faster 
                recoveries and consistent adherence to Visa and Mastercard rules that would be impossible through 
                manual operations.
              </p>
            </div>

            {/* What This Agent Does */}
            <div>
              <h2 className="text-lg font-bold mb-4">What This Agent Does</h2>
              
              <div className="mb-4">
                <h3 className="text-sm font-bold mb-2">Core Function</h3>
                <p className="text-muted-foreground leading-relaxed mb-4 text-xs">
                  The agent delivers four key value propositions:
                </p>
                
                <ol className="space-y-3 text-muted-foreground list-decimal pl-5 text-xs">
                  <li>
                    <strong className="text-foreground">Process Automation:</strong> Automates end-to-end chargeback identification, documentation, and 
                    filing — reducing manual effort and processing time from hours to minutes.
                  </li>
                  <li>
                    <strong className="text-foreground">Decision Precision:</strong> Uses AI-driven reason code matching and evidence assembly with high 
                    accuracy, minimizing subjective human errors and improving network acceptance rates.
                  </li>
                  <li>
                    <strong className="text-foreground">Real-time Alerting:</strong> Continuously monitors transactions and dispute triggers to instantly flag 
                    high-risk or time-sensitive chargebacks nearing network deadlines.
                  </li>
                  <li>
                    <strong className="text-foreground">Scalable Operations:</strong> Handles large volumes of disputes across multiple card networks (Visa, 
                    Mastercard, Amex) without additional operational overhead, enabling scale with compliance.
                  </li>
                </ol>
              </div>
            </div>

            {/* Key Capabilities */}
            <div>
              <h2 className="text-lg font-bold mb-4">Key Capabilities</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold mb-2">Automated Chargeback Processing:</h3>
                  <p className="text-muted-foreground text-xs">
                    Replaces manual case screening with AI-driven classification and filing that operates continuously across all networks.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Consistent Dispute Standardization:</h3>
                  <p className="text-muted-foreground text-xs">
                    Applies uniform Visa/Mastercard reason codes and evidence criteria, removing variability from individual reviewer judgment.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Immediate Risk Detection:</h3>
                  <p className="text-muted-foreground text-xs">
                    Instantly flags high-value, repetitive, or time-sensitive chargebacks before deadlines pass.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">High-Volume Handling:</h3>
                  <p className="text-muted-foreground text-xs">
                    Manages large-scale transaction and dispute volumes without requiring proportional increases in operational staff.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Quality Assurance:</h3>
                  <p className="text-muted-foreground text-xs">
                    Maintains complete audit trails, validation checks, and compliance logs to ensure accuracy and adherence to network standards.
                  </p>
                </div>
              </div>
            </div>

            {/* Process Workflow */}
            <div>
              <h2 className="text-lg font-bold mb-4">Process Workflow</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold mb-2">Automated Manual Process Replacement</h3>
                  
                  <div className="mb-3">
                    <h4 className="font-bold mb-1 text-xs">Traditional Process:</h4>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                      <li>Human agents manually review customer disputes, check eligibility, classify secured/unsecured transactions, and file chargebacks in Visa/Mastercard portals.</li>
                      <li>Each case takes 30–45 minutes to process, with high dependency on manual judgment and routing.</li>
                      <li>Temporary credit, reversal, and reconciliation steps are tracked separately, often leading to timing mismatches and losses.</li>
                    </ul>
                  </div>

                  <div className="mb-3">
                    <h4 className="font-bold mb-1 text-xs">Agent Process:</h4>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                      <li>AI-driven automation conducts eligibility checks, classification, investigation, and chargeback filing within 2–3 minutes per case.</li>
                      <li>Updates directly with Visa/Mastercard portals, bank's dashboard, and Feedzai for continuous updates.</li>
                      <li>Automates credit issuance, reconciliation, representment tracking, and escalation workflows.</li>
                    </ul>
                  </div>

                  <div className="mb-3">
                    <h4 className="font-bold mb-1 text-xs">Time Reduction:</h4>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                      <li>Reduces average case processing time by 90%+ while maintaining full auditability and compliance with network timelines.</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold mb-1 text-xs">Resource Optimization:</h4>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                      <li>Enables human teams to focus on complex representments, escalations, and arbitration cases, while the agent manages repetitive dispute handling.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Capabilities */}
            <div>
              <h2 className="text-lg font-bold mb-4">Agent Capabilities</h2>
              
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-xs">
                <li>Continuous Monitoring: 24/7 ingestion of customer disputes and transaction updates</li>
                <li>Real-Time Filing: Immediate chargeback submission to Visa/Mastercard portals post-validation</li>
                <li>Eligibility & Classification: Smart logic for secured/unsecured tagging, transaction thresholds, and MCC-based rules</li>
                <li>Reconciliation: Automated issuance, reversal, and conversion of temporary credits aligned with daily portal updates</li>
                <li>Representment & Arbitration: AI-assisted case drafting, evidence compilation, and escalation routing</li>
                <li>Compliance: Maintains timestamped audit trails, reconciliation logs, and SLA adherence</li>
              </ul>
            </div>

            {/* Coverage */}
            <div>
              <h2 className="text-lg font-bold mb-4">Coverage</h2>
              
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-xs">
                <li>Operates across Visa, Mastercard</li>
                <li>Handles domestic and cross-border disputes</li>
                <li>24/7 monitoring ensures no TAT breach during weekends or off-hours</li>
              </ul>
            </div>

            {/* Agent Processing Scenarios */}
            <div>
              <h2 className="text-lg font-bold mb-4">Agent Processing Scenarios</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold mb-2">High-Volume Routine Processing</h3>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                    <li><strong className="text-foreground">Scenario:</strong> Thousands of low-value or repetitive customer disputes (e.g., subscription or duplicate charges).</li>
                    <li><strong className="text-foreground">Manual Risk:</strong> Backlogs, missed filing windows, or non-compliance penalties.</li>
                    <li><strong className="text-foreground">Agent Advantage:</strong> Automatically validates, classifies, and files cases in batches, ensuring full compliance</li>
                    <li><strong className="text-foreground">Value:</strong> Maximized recoveries without increasing manpower.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Critical Event Immediate Response</h3>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                    <li><strong className="text-foreground">Scenario:</strong> Visa/Mastercard imposes penalties if &gt;35 chargebacks are filed on one card.</li>
                    <li><strong className="text-foreground">Manual Risk:</strong> Inconsistent prioritization — filing by time instead of value.</li>
                    <li><strong className="text-foreground">Agent Advantage:</strong> Automatically selects top 35 highest-value transactions for filing, preventing penalties while maximizing recovery.</li>
                    <li><strong className="text-foreground">Value:</strong> Optimized compliance and cost avoidance.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Representment / Arbitration Escalation</h3>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                    <li><strong className="text-foreground">Scenario:</strong> Merchant submits counter-evidence challenging the chargeback.</li>
                    <li><strong className="text-foreground">Manual Risk:</strong> Lost tracking, delayed response, missed SLA.</li>
                    <li><strong className="text-foreground">Agent Solution:</strong> Centralized representment queue, AI-generated response drafts, auto-tracking of pre-arbitration/arbitration stages.</li>
                    <li><strong className="text-foreground">Value:</strong> Improved win rates, reduced operational dependency on specific individuals.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-2">Complex Multi-System Reconciliation</h3>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                    <li><strong className="text-foreground">Scenario:</strong> Temporary credits issued but not reversed post chargeback rejection.</li>
                    <li><strong className="text-foreground">Manual Risk:</strong> Reconciliation errors or financial leakage.</li>
                    <li><strong className="text-foreground">Agent Solution:</strong> Auto cross-matching of Visa/MC portal outcomes with Wio's temp credit ledger and GL entries; triggers reversals or confirmations.</li>
                    <li><strong className="text-foreground">Value:</strong> Zero leakage, real-time financial accuracy.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Agent Audit Standards */}
            <div>
              <h2 className="text-lg font-bold mb-4">Agent Audit Standards</h2>
              
              <div className="mb-4">
                <h3 className="text-sm font-bold mb-2">Quality Assurance</h3>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                  <li>Audit Trail: Each case (TID, ARN) tagged with timestamps, decision logs, and user actions</li>
                  <li>Validation Checks: Data integrity verified during every portal sync</li>
                  <li>Error Detection: Missing TIDs, mismatched credits, or invalid reason codes flagged automatically</li>
                  <li>Reporting: Daily credit reconciliation report + SLA dashboard</li>
                  <li>Override Permissions: 2-step approval required to override AI classification decision</li>
                </ul>
              </div>
            </div>
          </div>

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
