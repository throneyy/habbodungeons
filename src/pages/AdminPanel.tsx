import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Upload, Save, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface EnemySprite {
  id: string;
  enemy_name: string;
  sprite_filename: string;
  updated_at: string;
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sprites, setSprites] = useState<EnemySprite[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ enemy_name: string; sprite_filename: string }>({
    enemy_name: "",
    sprite_filename: "",
  });
  const [newSprite, setNewSprite] = useState({ enemy_name: "", sprite_filename: "" });

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please log in to access admin panel");
        navigate("/auth");
        return;
      }

      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (error || !roles) {
        toast.error("Access denied. Admin privileges required.");
        navigate("/");
        return;
      }

      setIsAdmin(true);
      loadSprites();
    } catch (error) {
      console.error("Error checking admin status:", error);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const loadSprites = async () => {
    const { data, error } = await supabase
      .from("enemy_sprites")
      .select("*")
      .order("enemy_name");

    if (error) {
      toast.error("Failed to load sprites");
      console.error(error);
      return;
    }

    setSprites(data || []);
  };

  const handleEdit = (sprite: EnemySprite) => {
    setEditingId(sprite.id);
    setEditValues({
      enemy_name: sprite.enemy_name,
      sprite_filename: sprite.sprite_filename,
    });
  };

  const handleSave = async (id: string) => {
    const { error } = await supabase
      .from("enemy_sprites")
      .update({
        enemy_name: editValues.enemy_name,
        sprite_filename: editValues.sprite_filename,
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update sprite");
      console.error(error);
      return;
    }

    toast.success("Sprite updated successfully");
    setEditingId(null);
    loadSprites();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this sprite mapping?")) return;

    const { error } = await supabase
      .from("enemy_sprites")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete sprite");
      console.error(error);
      return;
    }

    toast.success("Sprite deleted successfully");
    loadSprites();
  };

  const handleAddNew = async () => {
    if (!newSprite.enemy_name || !newSprite.sprite_filename) {
      toast.error("Please fill in all fields");
      return;
    }

    const { error } = await supabase
      .from("enemy_sprites")
      .insert({
        enemy_name: newSprite.enemy_name,
        sprite_filename: newSprite.sprite_filename,
      });

    if (error) {
      toast.error("Failed to add sprite");
      console.error(error);
      return;
    }

    toast.success("Sprite added successfully");
    setNewSprite({ enemy_name: "", sprite_filename: "" });
    loadSprites();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading admin panel...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={() => navigate("/")} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Admin Panel - Enemy Sprites</h1>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add New Enemy Sprite</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="Enemy Name"
                value={newSprite.enemy_name}
                onChange={(e) => setNewSprite({ ...newSprite, enemy_name: e.target.value })}
              />
              <Input
                placeholder="Sprite Filename (e.g., ice-shade.png)"
                value={newSprite.sprite_filename}
                onChange={(e) => setNewSprite({ ...newSprite, sprite_filename: e.target.value })}
              />
              <Button onClick={handleAddNew}>
                <Upload className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Note: Make sure the sprite file exists in src/assets/ before adding it here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Enemy Sprite Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enemy Name</TableHead>
                  <TableHead>Sprite Filename</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sprites.map((sprite) => (
                  <TableRow key={sprite.id}>
                    <TableCell>
                      {editingId === sprite.id ? (
                        <Input
                          value={editValues.enemy_name}
                          onChange={(e) =>
                            setEditValues({ ...editValues, enemy_name: e.target.value })
                          }
                        />
                      ) : (
                        sprite.enemy_name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === sprite.id ? (
                        <Input
                          value={editValues.sprite_filename}
                          onChange={(e) =>
                            setEditValues({ ...editValues, sprite_filename: e.target.value })
                          }
                        />
                      ) : (
                        <span className="font-mono text-sm">{sprite.sprite_filename}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(sprite.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {editingId === sprite.id ? (
                          <>
                            <Button size="sm" onClick={() => handleSave(sprite.id)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(sprite)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(sprite.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
