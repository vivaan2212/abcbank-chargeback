import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { getUserRole } from "@/lib/auth";
import { Globe, ArrowRight, Zap, User, Shield } from "lucide-react";
import paceAvatar from "@/assets/pace-avatar.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<Session | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

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

  // Show welcome screen first, then login form
  if (!showLoginForm && !existingSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-between bg-background p-8">
        {/* Logo */}
        <div className="w-full max-w-4xl pt-12">
          <div className="flex items-center justify-center gap-2 mb-16">
            <Globe className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">ABC Bank</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Welcome to ABC Bank Chargeback Portal
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl">
            Let's get you set up with the right dispute resolution platform for your needs. 
            We'll guide you through a quick onboarding process.
          </p>

          <Button 
            size="lg"
            onClick={() => setShowLoginForm(true)}
            className="px-8 py-6 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Get Started
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>

          {/* Features */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-16">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Quick Setup</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Personalized</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Secure</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="w-full max-w-4xl pb-8">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Powered by</span>
            <div className="flex items-center gap-1">
              <img src={paceAvatar} alt="Pace" className="w-6 h-6 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show login form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-xl shadow-lg p-8 border border-border">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-6 h-6 text-primary" />
              <div className="text-2xl font-bold">ABC Bank</div>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              powered by 
              <img src={paceAvatar} alt="Pace" className="w-5 h-5 rounded-full inline-block ml-1" />
            </p>
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
                  className="h-11"
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
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
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
              className="text-primary hover:underline font-medium"
            >
              Sign up
            </button>
          </div>

          {showLoginForm && !existingSession && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowLoginForm(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to welcome
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
