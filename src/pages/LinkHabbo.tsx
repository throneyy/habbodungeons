import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [loading, setLoading] = useState(false);

  const fetchHabboProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-habbo-profile", {
        body: { username: habboUsername },
      });

      if (error) throw error;

      if (data.profile) {
        setHabboProfile(data.profile);
        toast({ title: "Habbo profile found!" });
      }
    } catch (error: any) {
      toast({
        title: "Failed to fetch Habbo profile",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const confirmLink = async () => {
    if (!habboProfile) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          habbo_username: habboProfile.name,
          habbo_profile_json: habboProfile as any,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({ title: "Habbo account linked successfully!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Failed to link account",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <HabboPanel title="Link Your Habbo Account">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="habbo-username">Habbo Username</Label>
              <div className="flex gap-2">
                <Input
                  id="habbo-username"
                  type="text"
                  value={habboUsername}
                  onChange={(e) => setHabboUsername(e.target.value)}
                  placeholder="Enter your Habbo username"
                  className="border-2 border-habbo-dark"
                />
                <Button
                  onClick={fetchHabboProfile}
                  disabled={loading || !habboUsername}
                  className="font-bold border-4 border-habbo-dark"
                >
                  {loading ? "Loading..." : "Fetch Profile"}
                </Button>
              </div>
            </div>

            {habboProfile && (
              <div className="space-y-4">
                <HabboPanel title="Confirm Habbo Profile" className="bg-muted">
                  <div className="flex items-center gap-4">
                    <img
                      src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboProfile.figureString}&size=l`}
                      alt={habboProfile.name}
                      className="w-24 h-24 border-4 border-habbo-dark rounded-lg"
                    />
                    <div className="space-y-1">
                      <p className="font-bold text-lg">{habboProfile.name}</p>
                      <p className="text-muted-foreground italic">{habboProfile.motto}</p>
                    </div>
                  </div>
                </HabboPanel>

                <Button
                  onClick={confirmLink}
                  disabled={loading}
                  className="w-full font-bold border-4 border-habbo-dark"
                  size="lg"
                >
                  {loading ? "Linking..." : "Confirm & Link"}
                </Button>
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
    </div>
  );
};

export default LinkHabbo;