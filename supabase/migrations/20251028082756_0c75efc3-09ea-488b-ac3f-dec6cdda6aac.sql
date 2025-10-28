-- Allow nulls in disputes.conversation_id to preserve disputes when conversations are deleted
ALTER TABLE public.disputes
ALTER COLUMN conversation_id DROP NOT NULL;