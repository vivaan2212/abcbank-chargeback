import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, BookOpen, Share2 } from "lucide-react";
import { toast } from "sonner";
import DisputesList from "@/components/DisputesList";
import { getUserRole } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import DisputeFilters, { DisputeFiltersType } from "@/components/DisputeFilters";
import ActivityLogView from "@/components/ActivityLogView";
import KnowledgeBasePanel from "@/components/KnowledgeBasePanel";
import { cn } from "@/lib/utils";
import { UploadToStorageButton } from "@/components/UploadToStorageButton";
const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [filters, setFilters] = useState<DisputeFiltersType>({});
  const [filterKey, setFilterKey] = useState(0);
  const [selectedDispute, setSelectedDispute] = useState<{
    id: string;
    transactionId: string | null;
    status: string;
  } | null>(null);
  const [counts, setCounts] = useState({
    needs_attention: 0,
    void: 0,
    in_progress: 0,
    done: 0
  });
  const [isKnowledgeBaseOpen, setIsKnowledgeBaseOpen] = useState(false);
  const [isKnowledgeBaseClosing, setIsKnowledgeBaseClosing] = useState(false);

  // Helper function to determine transaction bucket (aligned with DisputesList logic)
  const getLastActivityLog = (dispute: any, txn: any, repData: any, decisions: any[], actions: any[], customerEvidence: any, customerEvidenceReview: any): string | null => {
    const repStatus = repData?.representment_status;
    const hasWriteOffDecision = decisions.some((d: any) => d.decision === 'APPROVE_WRITEOFF');
    const hasChargebackAction = actions && actions.length > 0;
    const chargebackFiledOrApproved = hasChargebackAction || ['completed', 'approved', 'closed_won'].includes(dispute.status.toLowerCase());

    // Check for terminal states (highest priority)
    if (hasWriteOffDecision) return 'Write-off provided to customer';
    
    // Check for customer evidence review results
    if (customerEvidenceReview) {
      if (customerEvidenceReview.review_decision === 'approved') {
        return 'Chargeback request accepted by Visa; Temporary credit earlier processed has been made permanent';
      } else if (customerEvidenceReview.review_decision === 'rejected') {
        return 'Chargeback recalled; Merchant wins';
      }
    }

    // Check representment statuses (only show after chargeback filed)
    if (repData && chargebackFiledOrApproved) {
      if (repStatus === 'accepted_by_bank') {
        return 'Evidence reviewed and found valid; customer chargeback request to be recalled';
      } else if (repStatus === 'rejected_by_bank') {
        return 'Representment Rejected - Customer Wins';
      } else if (repStatus === 'pending' && repData.merchant_document_url) {
        return 'Merchant Representment Received';
      } else if (repStatus === 'awaiting_customer_info' && customerEvidence) {
        return 'Valid rebuttal representment evidence submitted by customer';
      } else if (repStatus === 'awaiting_customer_info' && !customerEvidence) {
        return 'Waiting for Customer Response';
      } else if (repStatus === 'no_representment') {
        return 'Merchant Representment Period Closed';
      }
    }

    // Check eligibility status
    if (dispute.eligibility_status) {
      const isEligible = dispute.eligibility_status.toUpperCase() === 'ELIGIBLE';
      if (!isEligible) {
        return 'Transaction is not eligible for chargeback';
      } else if (isEligible && !hasChargebackAction && !actions.length) {
        // If eligible but no chargeback actions yet, explicitly return this status
        return 'Transaction is eligible for chargeback';
      }
    }

    // Check for chargeback actions
    if (actions.length > 0) {
      const action = actions[0];
      if (action.chargeback_filed) return 'Chargeback filing completed';
      if (action.temporary_credit_issued) return 'Temporary credit approved';
      if (action.awaiting_merchant_refund) return 'Awaiting merchant refund';
      if (action.requires_manual_review) return 'Case requires manual review';
    }

    // Check final statuses
    const status = dispute.status?.toLowerCase() || '';
    if (['completed', 'approved', 'closed_won'].includes(status)) {
      return 'Chargeback approved - Case resolved';
    } else if (status === 'rejected') {
      return 'Chargeback rejected';
    } else if (['void', 'cancelled'].includes(status)) {
      return 'Case voided';
    }

    return 'Received a disputed transaction';
  };

  const determineTransactionBucket = (lastLog: string | null): 'done' | 'needs_attention' | 'in_progress' | 'void' => {
    if (!lastLog) return 'in_progress';

    // CASE: Write-off approved → DONE
    if (lastLog.includes('Write-off')) return 'done';

    // CASE: Transaction ineligible → DONE
    if (lastLog.includes('not eligible for chargeback')) return 'done';

    // CASE: Merchant representment received (needs bank decision) → NEEDS ATTENTION
    if (lastLog.includes('Merchant Representment Received')) return 'needs_attention';

    // CASE: Bank accepted representment (evidence reviewed - done) → DONE
    if (lastLog.includes('Evidence reviewed and found valid; customer chargeback request to be recalled')) return 'done';

    // CASE: Bank rejected representment, waiting for customer → NEEDS ATTENTION
    if (lastLog.includes('Waiting for Customer Response')) return 'needs_attention';

    // CASE: Customer evidence submitted (needs bank review) → NEEDS ATTENTION
    if (lastLog.includes('Valid rebuttal representment evidence submitted by customer')) return 'needs_attention';

    // CASE: Merchant accepted customer evidence → DONE
    if (lastLog.includes('Case Resolved - Merchant Accepted Evidence')) return 'done';

    // CASE: Bank rejected customer evidence, chargeback recalled → DONE
    if (lastLog.includes('Chargeback recalled')) return 'done';

    // Additional terminal states → DONE
    if (lastLog.includes('Chargeback approved') || 
        lastLog.includes('Case resolved') ||
        lastLog.includes('Chargeback request accepted by Visa') ||
        lastLog.includes('Temporary credit earlier processed has been made permanent') ||
        lastLog.includes('Representment Rejected - Customer Wins') ||
        lastLog.includes('Merchant Representment Period Closed') ||
        lastLog.includes('Merchant wins')) {
      return 'done';
    }

    // Transaction eligible (no actions yet) → IN PROGRESS
    if (lastLog.includes('Transaction is eligible for chargeback')) return 'in_progress';

    // Case voided
    if (lastLog.includes('voided')) return 'void';

    // Default to in_progress for all other logs
    return 'in_progress';
  };

  const loadCounts = async () => {
    try {
      // 1) Fetch disputes first (lean)
      const { data: disputesData, error } = await supabase
        .from('disputes')
        .select('id, status, transaction_id, eligibility_status');
      if (error) throw error;

      const disputeIds = (disputesData || []).map((d: any) => d.id);
      const transactionIds = (disputesData || [])
        .map((d: any) => d.transaction_id)
        .filter((id: string | null): id is string => !!id);

      // Early exit when nothing to count
      if (disputeIds.length === 0 || transactionIds.length === 0) {
        setCounts({ needs_attention: 0, void: 0, in_progress: 0, done: 0 });
        return;
      }

      // 2) Fetch related data in bulk
      const [txRes, repRes, decRes, actionsRes, evidenceRes, reviewsRes] = await Promise.all([
        supabase.from('transactions').select('id').in('id', transactionIds),
        supabase.from('chargeback_representment_static').select('transaction_id, representment_status, merchant_document_url, merchant_reason_text').in('transaction_id', transactionIds),
        supabase.from('dispute_decisions').select('dispute_id, decision').in('dispute_id', disputeIds),
        supabase.from('chargeback_actions').select('dispute_id, chargeback_filed, temporary_credit_issued, awaiting_merchant_refund, requires_manual_review').in('dispute_id', disputeIds),
        supabase.from('dispute_customer_evidence').select('transaction_id').in('transaction_id', transactionIds),
        supabase.from('customer_evidence_reviews').select('transaction_id, review_decision').in('transaction_id', transactionIds)
      ]);

      const txById: Record<string, any> = {};
      (txRes.data || []).forEach((t: any) => { txById[t.id] = t; });

      const repByTxnId: Record<string, any> = {};
      (repRes.data || []).forEach((r: any) => { repByTxnId[r.transaction_id] = r; });

      const decisionsByDispute: Record<string, any[]> = {};
      (decRes.data || []).forEach((d: any) => {
        if (!decisionsByDispute[d.dispute_id]) decisionsByDispute[d.dispute_id] = [];
        decisionsByDispute[d.dispute_id].push(d);
      });

      const actionsByDispute: Record<string, any[]> = {};
      (actionsRes.data || []).forEach((a: any) => {
        if (!actionsByDispute[a.dispute_id]) actionsByDispute[a.dispute_id] = [];
        actionsByDispute[a.dispute_id].push(a);
      });

      const evidenceByTxn: Record<string, any> = {};
      (evidenceRes.data || []).forEach((e: any) => {
        if (!evidenceByTxn[e.transaction_id]) evidenceByTxn[e.transaction_id] = e;
      });

      const reviewsByTxn: Record<string, any> = {};
      (reviewsRes.data || []).forEach((r: any) => {
        if (!reviewsByTxn[r.transaction_id]) reviewsByTxn[r.transaction_id] = r;
      });

      const newCounts = { needs_attention: 0, void: 0, in_progress: 0, done: 0 };

      (disputesData || []).forEach((dispute: any) => {
        // Only count disputes with a transaction
        if (!dispute.transaction_id) return;

        // Check for void status first
        if (['rejected', 'cancelled', 'expired', 'void'].includes(dispute.status)) {
          newCounts.void++;
          return;
        }

        const txn = txById[dispute.transaction_id];
        const rep = repByTxnId[dispute.transaction_id];
        const decisions = decisionsByDispute[dispute.id] || [];
        const actions = actionsByDispute[dispute.id] || [];
        const evidence = evidenceByTxn[dispute.transaction_id];
        const review = reviewsByTxn[dispute.transaction_id];

        // Get the last activity log and determine bucket
        const lastLog = getLastActivityLog(dispute, txn, rep, decisions, actions, evidence, review);
        const bucket = determineTransactionBucket(lastLog);

        newCounts[bucket]++;
      });

      setCounts(newCounts);
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        // Check if user is bank_admin
        getUserRole(session.user.id).then(role => {
          if (role !== 'bank_admin') {
            navigate("/portal");
            return;
          }
          setUser(session.user);
          loadCounts();
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate("/login");
      }
      setUser(session?.user ?? null);
    });

    // Subscribe to real-time updates for dispute counts
    const disputesChannel = supabase
      .channel('dispute-dashboard-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          console.log('Disputes update triggered:', payload);
          loadCounts();
        }
      )
      .subscribe((status) => {
        console.log('Disputes subscription status:', status);
      });

    // Also subscribe to transactions table for needs_attention updates
    const transactionsChannel = supabase
      .channel('transaction-dashboard-counts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('Transactions update triggered:', payload);
          loadCounts();
        }
      )
      .subscribe((status) => {
        console.log('Transactions subscription status:', status);
      });

    // Subscribe to representment status changes
    const representmentChannel = supabase
      .channel('representment-dashboard-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chargeback_representment_static'
        },
        (payload) => {
          console.log('Representment update triggered:', payload);
          loadCounts();
        }
      )
      .subscribe((status) => {
        console.log('Representment subscription status:', status);
      });

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(disputesChannel);
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(representmentChannel);
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('Logout error:', error);
      toast.success('Logged out successfully');
      navigate("/login");
    } catch (error) {
      console.error('Logout failed:', error);
      navigate("/login");
    }
  };

  const handleApplyFilters = () => {
    // Force re-render with new filters
    setFilterKey(prev => prev + 1);
  };

  const handleDisputeSelect = (dispute: { id: string; transactionId: string | null; status: string }) => {
    setSelectedDispute(dispute);
  };

  const handleBackToList = () => {
    setSelectedDispute(null);
  };

  const handleCloseKnowledgeBase = () => {
    setIsKnowledgeBaseClosing(true);
    setTimeout(() => {
      setIsKnowledgeBaseOpen(false);
      setIsKnowledgeBaseClosing(false);
    }, 400); // Match the animation duration
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Hidden when dispute is selected */}
      <div className={cn(
        "transition-all duration-300 ease-in-out",
        selectedDispute ? "w-0 opacity-0 overflow-hidden" : "w-56 opacity-100"
      )}>
        <DashboardSidebar activeSection="chargebacks" onLogout={handleLogout} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDispute ? (
          /* Activity Log View */
          <ActivityLogView
            disputeId={selectedDispute.id}
            transactionId={selectedDispute.transactionId}
            status={selectedDispute.status}
            onBack={handleBackToList}
          />
        ) : (
          <>
            {/* Top Bar */}
            <div className="px-6 py-3 flex items-center justify-between bg-[#fbfbfb]">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-semibold">Chargebacks</h1>
              </div>
              <div className={cn(
                "flex items-center gap-2 transition-all duration-500 ease-in-out",
                isKnowledgeBaseOpen ? "opacity-0 translate-x-4 pointer-events-none" : "opacity-100 translate-x-0"
              )}>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsKnowledgeBaseOpen(true)}
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Knowledge Base
                </Button>
                <Button variant="ghost" size="sm">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
              <div className="border rounded-lg h-full flex flex-col" style={{ backgroundColor: '#ffffff' }}>
                <Tabs defaultValue="in-progress" className="flex-1 flex flex-col">
                  <div className="px-6">
                    <TabsList className="h-12 bg-transparent gap-1">
                    <TabsTrigger 
                      value="needs-attention" 
                      className="rounded-md data-[state=active]:bg-[#f2f2f2] data-[state=active]:shadow-none"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm border-2 border-[#ff8c00] bg-transparent" />
                        Needs attention <span className="text-muted-foreground">{counts.needs_attention}</span>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="void"
                      className="rounded-md data-[state=active]:bg-[#f2f2f2] data-[state=active]:shadow-none"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm border-2 border-gray-400 bg-transparent" />
                        Void <span className="text-muted-foreground">{counts.void}</span>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="in-progress"
                      className="rounded-md data-[state=active]:bg-[#f2f2f2] data-[state=active]:shadow-none"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm border-2 border-[#4169e1] bg-transparent" />
                        In progress <span className="text-muted-foreground">{counts.in_progress}</span>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="done"
                      className="rounded-md data-[state=active]:bg-[#f2f2f2] data-[state=active]:shadow-none"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm border-2 border-[#22c55e] bg-transparent" />
                        Done <span className="text-muted-foreground">{counts.done}</span>
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4">
                  <div className="mb-4">
                    <DisputeFilters
                      filters={filters}
                      onFiltersChange={setFilters}
                      onApply={handleApplyFilters}
                    />
                  </div>

                  <TabsContent value="needs-attention" className="mt-0">
                    <DisputesList 
                      key={`needs-attention-${filterKey}`} 
                      statusFilter="needs_attention" 
                      filters={filters}
                      onDisputeSelect={handleDisputeSelect}
                    />
                  </TabsContent>

                  <TabsContent value="void" className="mt-0">
                    <DisputesList 
                      key={`void-${filterKey}`} 
                      statusFilter="void" 
                      filters={filters}
                      onDisputeSelect={handleDisputeSelect}
                    />
                  </TabsContent>

                  <TabsContent value="in-progress" className="mt-0">
                    <DisputesList 
                      key={`in-progress-${filterKey}`} 
                      statusFilter="in_progress" 
                      filters={filters}
                      onDisputeSelect={handleDisputeSelect}
                    />
                  </TabsContent>

                  <TabsContent value="done" className="mt-0">
                    <DisputesList 
                      key={`done-${filterKey}`} 
                      statusFilter="done" 
                      filters={filters}
                      onDisputeSelect={handleDisputeSelect}
                    />
                  </TabsContent>
                </div>
              </Tabs>
              </div>
            </div>
          </>
        )}
      </div>

      <KnowledgeBasePanel 
        isOpen={isKnowledgeBaseOpen}
        isClosing={isKnowledgeBaseClosing}
        onClose={handleCloseKnowledgeBase}
      />
    </div>
  );
};

export default Dashboard;
