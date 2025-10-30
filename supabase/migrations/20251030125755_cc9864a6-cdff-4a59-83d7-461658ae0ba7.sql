-- Fix realtime and triggers for live dashboard counts

-- 1) Ensure UPDATE payloads are emitted for these tables
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.disputes REPLICA IDENTITY FULL;
ALTER TABLE public.chargeback_representment_static REPLICA IDENTITY FULL;

-- 2) Add tables to realtime publication (idempotent via exception handling)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chargeback_representment_static;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

-- 3) Create triggers if missing to keep transactions.needs_attention in sync
DO $$
BEGIN
  -- Trigger to create representment record on new transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_create_representment_record'
  ) THEN
    CREATE TRIGGER trg_create_representment_record
      AFTER INSERT ON public.transactions
      FOR EACH ROW EXECUTE FUNCTION public.create_representment_record();
  END IF;

  -- Trigger to update transaction.needs_attention when representment status changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_transaction_needs_attention'
  ) THEN
    CREATE TRIGGER trg_update_transaction_needs_attention
      AFTER INSERT OR UPDATE OF representment_status ON public.chargeback_representment_static
      FOR EACH ROW EXECUTE FUNCTION public.update_transaction_needs_attention();
  END IF;
END$$;