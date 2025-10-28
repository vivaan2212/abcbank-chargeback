import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, BookOpen, Share2, Filter } from "lucide-react";
import { toast } from "sonner";
import DisputesList from "@/components/DisputesList";
import { getUserRole } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

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
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate("/login");
      }
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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
                    ⚠ Needs attention <span className="text-muted-foreground">0</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="void"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ⊘ Void <span className="text-muted-foreground">0</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="in-progress"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ◷ In progress <span className="text-muted-foreground">0</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger 
                  value="done"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  <span className="flex items-center gap-2">
                    ✓ Done <span className="text-muted-foreground">0</span>
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto px-6 pt-4">
              <div className="mb-4">
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </div>

              <TabsContent value="needs-attention" className="mt-0">
                <DisputesList statusFilter="needs_attention" />
              </TabsContent>

              <TabsContent value="void" className="mt-0">
                <DisputesList statusFilter="void" />
              </TabsContent>

              <TabsContent value="in-progress" className="mt-0">
                <DisputesList statusFilter="in_progress" />
              </TabsContent>

              <TabsContent value="done" className="mt-0">
                <DisputesList statusFilter="done" />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
