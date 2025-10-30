-- Create trigger to update transaction needs_attention when representment status changes
CREATE OR REPLACE FUNCTION public.update_transaction_needs_attention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When representment becomes pending or awaiting customer info, set needs_attention to true
  IF NEW.representment_status IN ('pending', 'awaiting_customer_info') THEN
    UPDATE public.transactions
    SET needs_attention = true
    WHERE id = NEW.transaction_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on chargeback_representment_static
DROP TRIGGER IF EXISTS on_representment_status_change ON public.chargeback_representment_static;
CREATE TRIGGER on_representment_status_change
  AFTER UPDATE OF representment_status
  ON public.chargeback_representment_static
  FOR EACH ROW
  WHEN (OLD.representment_status IS DISTINCT FROM NEW.representment_status)
  EXECUTE FUNCTION public.update_transaction_needs_attention();