-- Enable realtime for party_members table so members can see when others join
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;