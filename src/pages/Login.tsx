import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { getUserRole } from "@/lib/auth";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<Session | null>(null);

  useEffect(() => {
    // Check if user is already logged in but don't auto-redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      setExistingSession(session);
    });

    // Set up auth listener to handle session changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setExistingSession(session);
      
      if (session && event === 'SIGNED_IN') {
        // Only redirect on new sign-in, not on existing session
        setTimeout(async () => {
          const role = await getUserRole(session.user.id);
          if (role === 'bank_admin') {
            navigate("/dashboard");
          } else if (role === 'customer') {
            sessionStorage.setItem('portal:freshLogin', '1');
            navigate("/portal");
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setExistingSession(null);
      toast.success('Logged out successfully');
    } catch (error: any) {
      toast.error('Failed to log out');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session && data.user) {
        // Check user role to determine redirect
        const role = await getUserRole(data.user.id);
        
        if (role === 'bank_admin') {
          navigate("/dashboard");
        } else if (role === 'customer') {
          sessionStorage.setItem('portal:freshLogin', '1');
          navigate("/portal");
        } else {
          toast.error("No role assigned to this account");
          await supabase.auth.signOut();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Incorrect email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-sm p-8 border border-border">
          <div className="flex flex-col items-center mb-8">
            <div className="text-2xl font-bold mb-2">ABC Bank</div>
            <p className="text-sm text-muted-foreground">powered by Pace</p>
          </div>

          {existingSession ? (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  You are already logged in as
                </p>
                <p className="font-medium">{existingSession.user.email}</p>
              </div>
              
              <div className="space-y-2">
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Logging out..." : "Log out to sign in with different account"}
                </Button>
                
                <Button
                  onClick={async () => {
                    const role = await getUserRole(existingSession.user.id);
                    if (role === 'bank_admin') {
                      navigate("/dashboard");
                    } else if (role === 'customer') {
                      navigate("/portal");
                    }
                  }}
                  className="w-full"
                >
                  Continue to {existingSession.user.email?.includes('bank') ? 'Dashboard' : 'Portal'}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Need an account? </span>
            <button
              onClick={() => navigate("/signup")}
              className="text-primary hover:underline"
            >
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
