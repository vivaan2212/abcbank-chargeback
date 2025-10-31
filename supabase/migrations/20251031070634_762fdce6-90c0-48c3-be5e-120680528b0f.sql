-- Create table for tracking customer evidence requests
CREATE TABLE IF NOT EXISTS public.dispute_customer_evidence_request (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  customer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_upload',
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for storing customer evidence
CREATE TABLE IF NOT EXISTS public.dispute_customer_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  customer_id UUID NOT NULL,
  evidence_url TEXT,
  evidence_type TEXT NOT NULL,
  customer_note TEXT,
  ai_sufficient BOOLEAN,
  ai_summary TEXT,
  ai_reasons JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for dispute action log
CREATE TABLE IF NOT EXISTS public.dispute_action_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  action TEXT NOT NULL,
  network TEXT,
  performed_by UUID,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new representment statuses (prearbitration_filed, rejected_by_bank)
-- These are enum values that need to be added to the existing enum type

-- Enable RLS on new tables
ALTER TABLE public.dispute_customer_evidence_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_customer_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_action_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dispute_customer_evidence_request
CREATE POLICY "Customers can view their own evidence requests"
ON public.dispute_customer_evidence_request
FOR SELECT
USING (auth.uid() = customer_id OR has_role(auth.uid(), 'bank_admin'::app_role));

CREATE POLICY "System can insert evidence requests"
ON public.dispute_customer_evidence_request
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their own evidence requests"
ON public.dispute_customer_evidence_request
FOR UPDATE
USING (auth.uid() = customer_id);

-- RLS Policies for dispute_customer_evidence
CREATE POLICY "Customers can view their own evidence"
ON public.dispute_customer_evidence
FOR SELECT
USING (auth.uid() = customer_id OR has_role(auth.uid(), 'bank_admin'::app_role));

CREATE POLICY "Customers can insert their own evidence"
ON public.dispute_customer_evidence
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Bank admins can update evidence"
ON public.dispute_customer_evidence
FOR UPDATE
USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- RLS Policies for dispute_action_log
CREATE POLICY "Customers and admins can view action logs"
ON public.dispute_action_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = dispute_action_log.transaction_id
    AND (t.customer_id = auth.uid() OR has_role(auth.uid(), 'bank_admin'::app_role))
  )
);

CREATE POLICY "Bank admins can insert action logs"
ON public.dispute_action_log
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'bank_admin'::app_role));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_evidence_request_transaction ON public.dispute_customer_evidence_request(transaction_id);
CREATE INDEX IF NOT EXISTS idx_evidence_request_customer ON public.dispute_customer_evidence_request(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_evidence_transaction ON public.dispute_customer_evidence(transaction_id);
CREATE INDEX IF NOT EXISTS idx_customer_evidence_customer ON public.dispute_customer_evidence(customer_id);
CREATE INDEX IF NOT EXISTS idx_action_log_transaction ON public.dispute_action_log(transaction_id);