import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";

interface HabboProfile {
  name: string;
  figureString: string;
  motto: string;
}

const LinkHabbo = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [habboUsername, setHabboUsername] = useState("");
  const [habboProfile, setHabboProfile] = useState<HabboProfile | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const generateCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
  };

  const fetchHabboProfile = async () => {
    setLoading(true);
    try {
      const code = generateCode();
      setVerificationCode(code);

      const { data, error } = await supabase.functions.invoke("fetch-habbo-profile", {
        body: { username: habboUsername },
      });

      if (error) throw error;

      if (data.profile) {
        setHabboProfile(data.profile);
        setShowVerification(true);
        toast({ 
          title: "Profile found!", 
          description: `Please add the code ${code} to your Habbo Origins motto and click Verify.` 
        });
      }
    } catch (error: any) {
        toast({
          title: "Failed to fetch Habbo Origins profile",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const verifyAndLink = async () => {
    if (!habboProfile || !verificationCode) return;

    setLoading(true);
    try {
      // Fetch the profile again to check motto
      const { data, error } = await supabase.functions.invoke("fetch-habbo-profile", {
        body: { 
          username: habboUsername,
          verificationCode: verificationCode 
        },
      });

      if (error) throw error;

      if (!data.profile || !data.profile.motto.includes(verificationCode)) {
        throw new Error("Verification code not found in Habbo Origins motto. Please add the code to your motto and try again.");
      }

      // Link the account
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          habbo_username: habboProfile.name,
          habbo_profile_json: data.profile as any,
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      toast({ title: "Habbo Origins account verified and linked successfully!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <HabboPanel title="Link Your Habbo Origins Account">
          <div className="space-y-6">
            {!showVerification ? (
              <div className="space-y-2">
                <Label htmlFor="habbo-username">Habbo Origins Username</Label>
                <div className="flex gap-2">
                  <Input
                    id="habbo-username"
                    type="text"
                    value={habboUsername}
                    onChange={(e) => setHabboUsername(e.target.value)}
                    placeholder="Enter your Habbo Origins username"
                    className="border-2 border-habbo-dark"
                  />
                  <Button
                    onClick={fetchHabboProfile}
                    disabled={loading || !habboUsername}
                    className="font-bold border-4 border-habbo-dark"
                  >
                    {loading ? <LoadingSpinner /> : "Next"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <HabboPanel title="Verify Your Account" className="bg-muted">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="border-4 border-habbo-dark rounded-lg overflow-hidden bg-card">
                        <img
                          src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboProfile?.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=l`}
                          alt={habboProfile?.name}
                          className="pixel-icon"
                          style={{ width: 'auto', height: 'auto', maxWidth: '120px' }}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-lg">{habboProfile?.name}</p>
                        <p className="text-muted-foreground italic">{habboProfile?.motto}</p>
                      </div>
                    </div>

                    <div className="bg-background p-4 rounded-lg border-4 border-habbo-dark">
                      <p className="font-bold mb-2">Verification Steps:</p>
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Copy this code: <span className="font-mono bg-primary text-primary-foreground px-2 py-1 rounded">{verificationCode}</span></li>
                        <li>Go to Habbo Origins and add it to your motto (bio)</li>
                        <li>Come back and click "Verify & Link"</li>
                      </ol>
                    </div>
                  </div>
                </HabboPanel>

                <div className="flex gap-2">
                  <Button
                    onClick={verifyAndLink}
                    disabled={loading}
                    className="flex-1 font-bold border-4 border-habbo-dark"
                    size="lg"
                  >
                    {loading ? "Verifying..." : "Verify & Link"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowVerification(false);
                      setHabboProfile(null);
                      setVerificationCode("");
                    }}
                    disabled={loading}
                    className="font-bold border-4 border-habbo-dark"
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="w-full font-bold border-4 border-habbo-dark"
            >
              Skip for Now
            </Button>
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default LinkHabbo;
