-- Ensure server_players has REPLICA IDENTITY FULL for realtime
ALTER TABLE server_players REPLICA IDENTITY FULL;