-- Create merchant_representments table
CREATE TABLE public.merchant_representments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  has_representment BOOLEAN NOT NULL DEFAULT false,
  representment_reason_code TEXT,
  representment_reason_text TEXT,
  representment_document_url TEXT,
  representment_created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  representment_source TEXT CHECK (representment_source IN ('merchant_portal', 'scheme_api', 'manual_upload')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add new columns to transactions table
ALTER TABLE public.transactions
ADD COLUMN dispute_status TEXT DEFAULT 'not_disputed',
ADD COLUMN temporary_credit_provided BOOLEAN DEFAULT false,
ADD COLUMN temporary_credit_amount NUMERIC DEFAULT 0,
ADD COLUMN temporary_credit_currency TEXT,
ADD COLUMN chargeback_case_id TEXT,
ADD COLUMN needs_attention BOOLEAN DEFAULT false,
ADD COLUMN temporary_credit_reversal_at TIMESTAMP WITH TIME ZONE;

-- Add chargeback_case_id to chargeback_actions if not exists
ALTER TABLE public.chargeback_actions
ADD COLUMN IF NOT EXISTS chargeback_case_id TEXT;

-- Enable RLS
ALTER TABLE public.merchant_representments ENABLE ROW LEVEL SECURITY;

-- RLS policies for merchant_representments
CREATE POLICY "Customers can view their own representments"
ON public.merchant_representments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE transactions.id = merchant_representments.transaction_id
    AND (transactions.customer_id = auth.uid() OR has_role(auth.uid(), 'bank_admin'::app_role))
  )
);

CREATE POLICY "Bank admins can manage representments"
ON public.merchant_representments FOR ALL
USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- Create audit log table for representment actions
CREATE TABLE public.representment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reason TEXT,
  merchant_document_url TEXT,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.representment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bank admins can view audit log"
ON public.representment_audit_log FOR SELECT
USING (has_role(auth.uid(), 'bank_admin'::app_role));

CREATE POLICY "System can insert audit log"
ON public.representment_audit_log FOR INSERT
WITH CHECK (auth.uid() = performed_by OR has_role(auth.uid(), 'bank_admin'::app_role));

-- Create updated_at trigger for merchant_representments
CREATE TRIGGER update_merchant_representments_updated_at
BEFORE UPDATE ON public.merchant_representments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();