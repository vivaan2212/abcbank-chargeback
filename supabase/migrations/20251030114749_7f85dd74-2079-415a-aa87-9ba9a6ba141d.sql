-- Update function to manage needs_attention on representment INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.update_transaction_needs_attention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set needs_attention based on representment status
  IF NEW.representment_status IN ('pending', 'awaiting_customer_info') THEN
    UPDATE public.transactions
    SET needs_attention = true
    WHERE id = NEW.transaction_id;
  ELSIF NEW.representment_status IN ('no_representment', 'accepted_by_bank', 'rejected_by_bank') THEN
    UPDATE public.transactions
    SET needs_attention = false
    WHERE id = NEW.transaction_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate triggers to fire on INSERT and UPDATE
DROP TRIGGER IF EXISTS on_representment_status_change ON public.chargeback_representment_static;
CREATE TRIGGER on_representment_status_change
  AFTER INSERT OR UPDATE OF representment_status
  ON public.chargeback_representment_static
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transaction_needs_attention();

-- Backfill existing data to ensure consistency now
UPDATE public.transactions t
SET needs_attention = true
FROM public.chargeback_representment_static cr
WHERE cr.transaction_id = t.id
  AND cr.representment_status IN ('pending', 'awaiting_customer_info');

UPDATE public.transactions t
SET needs_attention = false
FROM public.chargeback_representment_static cr
WHERE cr.transaction_id = t.id
  AND cr.representment_status IN ('no_representment', 'accepted_by_bank', 'rejected_by_bank');