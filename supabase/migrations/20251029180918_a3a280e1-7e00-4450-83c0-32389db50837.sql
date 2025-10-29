-- Create delete_operations table for idempotency tracking
CREATE TABLE IF NOT EXISTS public.delete_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{"ok": true}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delete_operations ENABLE ROW LEVEL SECURITY;

-- Users can view their own delete operations
CREATE POLICY "Users can view their own delete operations"
  ON public.delete_operations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own delete operations
CREATE POLICY "Users can insert their own delete operations"
  ON public.delete_operations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for fast idempotency key lookups
CREATE INDEX idx_delete_operations_idempotency_key ON public.delete_operations(idempotency_key);
CREATE INDEX idx_delete_operations_user_id ON public.delete_operations(user_id);
CREATE INDEX idx_delete_operations_created_at ON public.delete_operations(created_at);

-- Function to purge old delete operation logs (30 days)
CREATE OR REPLACE FUNCTION public.purge_old_delete_operations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.delete_operations
  WHERE created_at < now() - interval '30 days';
END;
$$;