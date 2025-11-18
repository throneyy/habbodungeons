-- Enable realtime for servers table
ALTER PUBLICATION supabase_realtime ADD TABLE servers;

-- Ensure servers has REPLICA IDENTITY FULL for realtime
ALTER TABLE servers REPLICA IDENTITY FULL;