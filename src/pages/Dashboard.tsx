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

  const loadCounts = async () => {
    try {
      // 1) Fetch disputes first (lean)
      const { data: disputesData, error } = await supabase
        .from('disputes')
        .select('id, status, transaction_id');
      if (error) throw error;

      const disputeIds = (disputesData || []).map((d: any) => d.id);
      const transactionIds = (disputesData || [])
        .map((d: any) => d.transaction_id)
        .filter((id: string | null): id is string => !!id);

      // Early exit when nothing to count
      if (disputeIds.length === 0) {
        setCounts({ needs_attention: 0, void: 0, in_progress: 0, done: 0 });
        return;
      }

      // 2) Fetch related data in bulk (no implicit joins)
      const [txRes, repRes, decRes] = await Promise.all([
        supabase.from('transactions').select('id, needs_attention, dispute_status').in('id', transactionIds),
        supabase.from('chargeback_representment_static').select('transaction_id, representment_status').in('transaction_id', transactionIds),
        supabase.from('dispute_decisions').select('dispute_id, decision').in('dispute_id', disputeIds),
      ]);

      const txById: Record<string, { id: string; needs_attention: boolean | null; dispute_status: string | null }> = {};
      (txRes.data || []).forEach((t: any) => { txById[t.id] = t; });

      const repByTxnId: Record<string, { transaction_id: string; representment_status: string | null }> = {};
      (repRes.data || []).forEach((r: any) => { repByTxnId[r.transaction_id] = r; });

      const decisionsByDispute: Record<string, any[]> = {};
      (decRes.data || []).forEach((d: any) => {
        if (!decisionsByDispute[d.dispute_id]) decisionsByDispute[d.dispute_id] = [];
        decisionsByDispute[d.dispute_id].push(d);
      });

      const newCounts = { needs_attention: 0, void: 0, in_progress: 0, done: 0 };

      (disputesData || []).forEach((dispute: any) => {
        // Only count disputes with a transaction
        if (!dispute.transaction_id) return;

        const status: string = dispute.status;
        const txn = txById[dispute.transaction_id];
        const rep = repByTxnId[dispute.transaction_id];
        const repStatus = rep?.representment_status;
        const decisions = decisionsByDispute[dispute.id] || [];
        const hasWriteOffDecision = decisions.some((d: any) => d.decision === 'APPROVE_WRITEOFF');

        // DONE - terminal states must always win over needs_attention
        const isTerminalDone = (
          hasWriteOffDecision ||
          status === 'write_off_approved' ||
          ['done', 'completed', 'approved', 'ineligible', 'closed_lost', 'closed_won', 'representment_contested', 'write_off_approved'].includes(status) ||
          repStatus === 'no_representment' ||
          repStatus === 'accepted_by_bank' ||
          repStatus === 'customer_evidence_rejected' ||
          txn?.dispute_status === 'closed_won' ||
          txn?.dispute_status === 'closed_lost' ||
          txn?.dispute_status === 'merchant_won'
        );
        if (isTerminalDone) {
          newCounts.done++;
          return;
        }

        // VOID
        if (['rejected', 'cancelled', 'expired', 'void'].includes(status)) {
          newCounts.void++;
          return;
        }

        // NEEDS ATTENTION (non-terminal only)
        if (
          status !== 'in_progress' &&
          (
            repStatus === 'pending' ||
            repStatus === 'awaiting_customer_info' ||
            txn?.dispute_status === 'evidence_submitted' ||
            txn?.needs_attention === true ||
            ['requires_action', 'needs_attention', 'pending_manual_review', 'awaiting_settlement'].includes(status)
          )
        ) {
          newCounts.needs_attention++;
          return;
        }

        // IN PROGRESS
        if ([
          'started', 'transaction_selected', 'eligibility_checked', 'reason_selected',
          'documents_uploaded', 'under_review', 'awaiting_investigation', 'chargeback_filed',
          'awaiting_merchant_refund'
        ].includes(status)) {
          newCounts.in_progress++;
          return;
        }
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
                "flex items-center gap-2 transition-opacity duration-300",
                isKnowledgeBaseOpen && "opacity-0 pointer-events-none"
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
