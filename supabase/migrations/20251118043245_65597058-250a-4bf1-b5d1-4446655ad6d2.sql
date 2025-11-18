-- Enable realtime for server_players table
ALTER PUBLICATION supabase_realtime ADD TABLE server_players;

-- Ensure RLS is set up to allow all players to see server membership
-- (This should already exist but let's verify)