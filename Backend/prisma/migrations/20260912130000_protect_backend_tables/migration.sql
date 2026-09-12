-- This application authenticates through Express, not Supabase Auth/Data API.
-- PostgreSQL's trusted backend connection retains access; browser roles do not.
DO $$
DECLARE
  table_name text;
  client_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'College', 'Profile', 'Interest', 'UserInterest', 'Skill',
    'UserSkill', 'Connection', 'Block', 'Conversation',
    'ConversationParticipant', 'Message', 'Report', 'Notification',
    'UserSession', 'AuthToken', 'Verification', 'Pass', 'AdminAction',
    'AnalyticsEvent', 'StorageDeletion', 'Idea', 'IdeaResonance',
    'CampusEvent', 'EventRSVP', '_prisma_migrations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, client_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
