import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, BookOpen, Share2, Check, X } from "lucide-react";
import { toast } from "sonner";
import DisputesList from "@/components/DisputesList";
import { getUserRole } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import DisputeFilters, { DisputeFiltersType } from "@/components/DisputeFilters";
import ActivityLogView from "@/components/ActivityLogView";
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
      const { data, error } = await supabase
        .from('disputes')
        .select('status, transaction_id, transaction:transactions(needs_attention)');
      
      if (error) throw error;
      
      const newCounts = {
        needs_attention: 0,
        void: 0,
        in_progress: 0,
        done: 0
      };
      
      // Only count disputes after transaction selection
      const disputesWithTransactions = data?.filter(d => d.transaction_id !== null) || [];
      
      disputesWithTransactions.forEach(dispute => {
        const status = dispute.status;
        
        // Map database statuses to display categories
        if (['started', 'transaction_selected', 'eligibility_checked', 'reason_selected', 'documents_uploaded', 'under_review'].includes(status)) {
          newCounts.in_progress++;
        } else if (status === 'needs_attention' || status === 'requires_action' || (dispute as any).transaction?.needs_attention === true) {
          newCounts.needs_attention++;
        } else if (status === 'void' || status === 'rejected' || status === 'cancelled') {
          newCounts.void++;
        } else if (status === 'done' || status === 'completed' || status === 'approved' || status === 'ineligible' || status === 'closed_lost' || status === 'closed_won' || status === 'representment_contested') {
          newCounts.done++;
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
            <div className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-semibold">Chargebacks</h1>
              </div>
              <div className="flex items-center gap-2">
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
            <div className="flex-1 overflow-auto pl-4 pt-4">
              <div className="border rounded-lg bg-background h-full flex flex-col">
                <Tabs defaultValue="in-progress" className="flex-1 flex flex-col">
                  <div className="border-b px-6">
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

      {/* Knowledge Base Overlay */}
      {isKnowledgeBaseOpen && (
        <>
          {/* Dark Backdrop */}
          <div 
            className={cn(
              "fixed inset-0 bg-black/50 z-40",
              isKnowledgeBaseClosing ? "animate-fade-out" : "animate-fade-in"
            )}
            onClick={handleCloseKnowledgeBase}
          />
          
          {/* Sliding Panel */}
          <div className={cn(
            "fixed top-0 right-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-background z-50 shadow-2xl overflow-hidden flex flex-col",
            isKnowledgeBaseClosing ? "animate-slide-out-right" : "animate-slide-in-right"
          )}>
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Knowledge</h2>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Updated 10m ago</span>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span className="text-sm">4</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">💬</span>
                  <span className="text-sm">2</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseKnowledgeBase}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-6 py-6">
              <div className="max-w-3xl space-y-6">
                <div>
                  <h1 className="text-3xl font-bold mb-6">Chargeback for Banks</h1>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    This agent automates the end-to-end chargeback filing process by eliminating manual case review, 
                    reducing human error in dispute categorization, and ensuring timely, compliant submissions across 
                    card networks. It processes high-volume transaction and dispute data, identifies eligible chargebacks, 
                    compiles supporting evidence, and files them accurately within network timelines — enabling faster 
                    recoveries and consistent adherence to Visa and Mastercard rules that would be impossible through 
                    manual operations.
                  </p>

                  <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
                  
                  <ul className="space-y-3 text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="text-primary">•</span>
                      <span>Automated eligibility assessment based on card network rules</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary">•</span>
                      <span>Intelligent reason code selection and documentation</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary">•</span>
                      <span>Real-time tracking and status updates</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary">•</span>
                      <span>Integration with banking systems and card networks</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
