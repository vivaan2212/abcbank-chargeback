-- Create representment_audit_log table to track admin actions on representment
CREATE TABLE IF NOT EXISTS public.representment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accept','reject','request_customer_info')),
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_notes TEXT,
  merchant_document_url TEXT
);

-- Enable RLS
ALTER TABLE public.representment_audit_log ENABLE ROW LEVEL SECURITY;

-- Policies: customers and bank admins can view logs for their transactions
CREATE POLICY "Customers and admins can view representment audit logs"
ON public.representment_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = representment_audit_log.transaction_id
      AND (t.customer_id = auth.uid() OR has_role(auth.uid(), 'bank_admin'))
  )
);

-- Bank admins can insert audit logs
CREATE POLICY "Bank admins can insert representment audit logs"
ON public.representment_audit_log
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'bank_admin'));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_rep_audit_tx ON public.representment_audit_log (transaction_id);
CREATE INDEX IF NOT EXISTS idx_rep_audit_time ON public.representment_audit_log (performed_at);
