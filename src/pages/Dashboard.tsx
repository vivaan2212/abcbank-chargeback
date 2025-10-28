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

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [filters, setFilters] = useState<DisputeFiltersType>({});
  const [filterKey, setFilterKey] = useState(0);
  const [counts, setCounts] = useState({
    needs_attention: 0,
    void: 0,
    in_progress: 0,
    done: 0
  });

  const loadCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('disputes')
        .select('status');
      
      if (error) throw error;
      
      const newCounts = {
        needs_attention: 0,
        void: 0,
        in_progress: 0,
        done: 0
      };
      
      data?.forEach(dispute => {
        const status = dispute.status;
        
        // Map database statuses to display categories
        if (['started', 'transaction_selected', 'eligibility_checked', 'reason_selected', 'documents_uploaded', 'under_review'].includes(status)) {
          newCounts.in_progress++;
        } else if (status === 'needs_attention') {
          newCounts.needs_attention++;
        } else if (status === 'void') {
          newCounts.void++;
        } else if (status === 'done' || status === 'completed' || status === 'resolved') {
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
    const channel = supabase
      .channel('dispute-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes'
        },
        () => {
          loadCounts();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
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

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <DashboardSidebar activeSection="chargebacks" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="border-b px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Chargebacks</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <BookOpen className="h-4 w-4 mr-2" />
              Knowledge Base
            </Button>
            <Button variant="ghost" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="in-progress" className="h-full flex flex-col">
            <div className="border-b px-6">
              <TabsList className="h-12 bg-transparent">
                <TabsTrigger 
                  value="needs-attention" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ⚠ Needs attention <span className="text-muted-foreground">{counts.needs_attention}</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="void"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ⊘ Void <span className="text-muted-foreground">{counts.void}</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="in-progress"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ◷ In progress <span className="text-muted-foreground">{counts.in_progress}</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="done"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ✓ Done <span className="text-muted-foreground">{counts.done}</span>
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto px-6 pt-4">
              <div className="mb-4">
                <DisputeFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  onApply={handleApplyFilters}
                />
              </div>

              <TabsContent value="needs-attention" className="mt-0">
                <DisputesList key={`needs-attention-${filterKey}`} statusFilter="needs_attention" filters={filters} />
              </TabsContent>

              <TabsContent value="void" className="mt-0">
                <DisputesList key={`void-${filterKey}`} statusFilter="void" filters={filters} />
              </TabsContent>

              <TabsContent value="in-progress" className="mt-0">
                <DisputesList key={`in-progress-${filterKey}`} statusFilter="in_progress" filters={filters} />
              </TabsContent>

              <TabsContent value="done" className="mt-0">
                <DisputesList key={`done-${filterKey}`} statusFilter="done" filters={filters} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
