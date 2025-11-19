import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { AlertCircle } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  // Password Reset States
  const [resetStep, setResetStep] = useState<"username" | "verify" | "newpassword">("username");
  const [resetUsername, setResetUsername] = useState("");
  const [resetHabboUsername, setResetHabboUsername] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [habboUsername, setHabboUsername] = useState("");
  const [showReset, setShowReset] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Convert username to email format for Supabase Auth
    const email = `${loginUsername.toLowerCase()}@habbo-dungeons.local`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    });

    if (error) {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Welcome back!" });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== signupConfirm) {
      toast({
        title: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // Convert username to email format for Supabase Auth
    const email = `${signupUsername.toLowerCase()}@habbo-dungeons.local`;

    const { error } = await supabase.auth.signUp({
      email,
      password: signupPassword,
      options: {
        data: { username: signupUsername },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      toast({
        title: "Signup Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Account created! Redirecting..." });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetUsername || !resetHabboUsername) {
      toast({
        title: "Missing Information",
        description: "Please enter both your HabboDungeons username and Habbo username",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('request-password-reset', {
        body: { 
          username: resetUsername,
          habboUsername: resetHabboUsername 
        }
      });

      if (error) throw error;

      if (data.success) {
        setVerificationCode(data.verificationCode);
        setHabboUsername(data.habboUsername);
        setResetStep("verify");
        toast({
          title: "Verification Code Generated",
          description: `Go to origins.habbo.com and change your motto to include: ${data.verificationCode}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleVerifyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-habbo-reset', {
        body: { 
          username: resetUsername,
          verificationCode,
          habboUsername 
        }
      });

      if (error) throw error;

      if (data.verified) {
        setResetStep("newpassword");
        toast({
          title: "Verified!",
          description: "You can now set a new password",
        });
      } else {
        toast({
          title: "Verification Failed",
          description: "Code not found in your Habbo motto. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== newPasswordConfirm) {
      toast({
        title: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { 
          username: resetUsername,
          newPassword,
          verificationCode 
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Password Reset!",
          description: "You can now login with your new password",
        });
        setShowReset(false);
        setResetStep("username");
        setResetUsername("");
        setNewPassword("");
        setNewPasswordConfirm("");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-center">
        <div className="w-full max-w-md">
          <HabboPanel title="Welcome to Habbo Dungeons">
            {showReset ? (
              <div className="space-y-4">
                <Button 
                  onClick={() => setShowReset(false)}
                  variant="ghost"
                  className="mb-4"
                >
                  ← Back to Login
                </Button>

                {resetStep === "username" && (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-username">HabboDungeons Username</Label>
                      <Input
                        id="reset-username"
                        type="text"
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        required
                        className="border-2 border-habbo-dark"
                        placeholder="Your game username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-habbo-username">Habbo Username</Label>
                      <Input
                        id="reset-habbo-username"
                        type="text"
                        value={resetHabboUsername}
                        onChange={(e) => setResetHabboUsername(e.target.value)}
                        required
                        className="border-2 border-habbo-dark"
                        placeholder="Your Habbo Origins username"
                      />
                    </div>
                    <div className="bg-blue-500/10 border-2 border-blue-500 p-3 rounded">
                      <p className="text-sm text-foreground">
                        <AlertCircle className="inline w-4 h-4 mr-2" />
                        You'll need to verify your Habbo Origins account by adding a code to your motto
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full font-bold border-4 border-habbo-dark"
                      disabled={loading}
                    >
                      {loading ? "Generating Code..." : "Request Reset"}
                    </Button>
                  </form>
                )}

                {resetStep === "verify" && (
                  <form onSubmit={handleVerifyReset} className="space-y-4">
                    <div className="bg-yellow-500/10 border-2 border-yellow-500 p-4 rounded space-y-2">
                      <p className="font-bold text-foreground">Verification Required:</p>
                      <p className="text-sm text-foreground">1. Go to origins.habbo.com and login as <span className="font-bold">{habboUsername}</span></p>
                      <p className="text-sm text-foreground">2. Change your motto to include this code:</p>
                      <p className="text-lg font-mono font-bold text-primary bg-background p-2 rounded text-center">{verificationCode}</p>
                      <p className="text-sm text-foreground">3. Click "Verify" below</p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full font-bold border-4 border-habbo-dark"
                      disabled={loading}
                    >
                      {loading ? "Verifying..." : "Verify Habbo Account"}
                    </Button>
                  </form>
                )}

                {resetStep === "newpassword" && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="border-2 border-habbo-dark"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password-confirm">Confirm New Password</Label>
                      <Input
                        id="new-password-confirm"
                        type="password"
                        value={newPasswordConfirm}
                        onChange={(e) => setNewPasswordConfirm(e.target.value)}
                        required
                        className="border-2 border-habbo-dark"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full font-bold border-4 border-habbo-dark"
                      disabled={loading}
                    >
                      {loading ? "Resetting..." : "Reset Password"}
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Log In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    required
                    className="border-2 border-habbo-dark"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="border-2 border-habbo-dark"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full font-bold border-4 border-habbo-dark"
                  disabled={loading}
                >
                  {loading ? "Logging in..." : "Log In"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowReset(true)}
                  className="w-full"
                >
                  Forgot Password?
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Username</Label>
                  <Input
                    id="signup-username"
                    type="text"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    required
                    className="border-2 border-habbo-dark"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    className="border-2 border-habbo-dark"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                    required
                    className="border-2 border-habbo-dark"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full font-bold border-4 border-habbo-dark"
                  disabled={loading}
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
              </Tabs>
            )}
        </HabboPanel>
        </div>
      </div>
    </AppLayout>
  );
};

export default Auth;