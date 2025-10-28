-- Remove CASCADE DELETE from disputes.conversation_id foreign key
-- This ensures disputes persist even when conversations are deleted
ALTER TABLE public.disputes 
DROP CONSTRAINT IF EXISTS disputes_conversation_id_fkey;

-- Recreate the foreign key without CASCADE DELETE
ALTER TABLE public.disputes
ADD CONSTRAINT disputes_conversation_id_fkey 
FOREIGN KEY (conversation_id) 
REFERENCES public.conversations(id) 
ON DELETE SET NULL;