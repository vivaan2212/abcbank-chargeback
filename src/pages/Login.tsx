import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { getUserRole } from "@/lib/auth";
import { Globe, Zap, User, Brain } from "lucide-react";
import paceAvatar from "@/assets/pace-avatar.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<Session | null>(null);
  const [loginStep, setLoginStep] = useState<'welcome' | 'email' | 'password'>('welcome');

  useEffect(() => {
    // Check if user is already logged in but don't auto-redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      setExistingSession(session);
    });

    // Set up auth listener to handle session changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setExistingSession(session);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // Try global sign out first
      const { error } = await supabase.auth.signOut();

      if (error) {
        // If the session is already gone on the server, clear locally
        const message = (error as any)?.message?.toString()?.toLowerCase() || '';
        if (message.includes('session') || message.includes('not exist')) {
          await supabase.auth.signOut({ scope: 'local' });
        } else {
          throw error;
        }
      }

      // Clear local UI state regardless
      setExistingSession(null);
      toast.success('Logged out successfully');
    } catch (error: any) {
      console.error('Logout error:', error);
      // Best-effort local clear to avoid being stuck logged in
      try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      setExistingSession(null);
      toast.success('Logged out successfully');
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

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      setLoginStep('password');
    }
  };

  const validateEmail = () => {
    return email && email.includes('@');
  };

  // Show welcome screen with inline form expansion
  if (loginStep !== 'password' && !existingSession) {
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
            Welcome to ABC Bank Dispute Portal
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl">
            Login securely to access your dispute and chargeback support assistant
          </p>

          {loginStep === 'welcome' ? (
            <Button 
              size="lg"
              onClick={() => setLoginStep('email')}
              className="px-8 py-6 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Login
            </Button>
          ) : (
            <form onSubmit={handleEmailSubmit} className="w-full max-w-md space-y-4">
              <div className="space-y-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 text-base"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading || !validateEmail()}
              >
                Continue
              </Button>
            </form>
          )}

          {/* Features */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-16">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Quick support</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Personalised</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Intelligent</span>
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

  // Show password form
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
          Welcome to ABC Bank Dispute Portal
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl">
          Login securely to access your dispute and chargeback support assistant
        </p>

        <div className="w-full max-w-md">
          {existingSession ? (
            <div className="space-y-4 bg-card rounded-xl p-6 border border-border">
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
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 text-base"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Continue"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setLoginStep('email')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to email
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Features */}
        <div className="flex flex-wrap items-center justify-center gap-8 mt-16">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">Quick support</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">Personalised</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">Intelligent</span>
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
};

export default Login;
