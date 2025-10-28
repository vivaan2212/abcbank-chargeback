import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import DisputesList from "@/components/DisputesList";
import { getUserRole } from "@/lib/auth";

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
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-semibold">ABC Bank - Chargebacks Dashboard</h1>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="in-progress" className="w-full">
          <TabsList>
            <TabsTrigger value="needs-attention">
              Needs attention
            </TabsTrigger>
            <TabsTrigger value="void">
              Void
            </TabsTrigger>
            <TabsTrigger value="in-progress">
              In progress
            </TabsTrigger>
            <TabsTrigger value="done">
              Done
            </TabsTrigger>
          </TabsList>

          <TabsContent value="needs-attention" className="mt-6">
            <DisputesList statusFilter="needs_attention" />
          </TabsContent>

          <TabsContent value="void" className="mt-6">
            <DisputesList statusFilter="void" />
          </TabsContent>

          <TabsContent value="in-progress" className="mt-6">
            <DisputesList statusFilter="in_progress" />
          </TabsContent>

          <TabsContent value="done" className="mt-6">
            <DisputesList statusFilter="done" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
