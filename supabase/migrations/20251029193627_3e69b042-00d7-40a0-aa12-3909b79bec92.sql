-- Create table for storing dispute decisions
CREATE TABLE IF NOT EXISTS public.dispute_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN (
    'FILE_CHARGEBACK',
    'FILE_CHARGEBACK_WITH_TEMP_CREDIT',
    'WAIT_FOR_SETTLEMENT',
    'REQUEST_REFUND_FROM_MERCHANT',
    'DECLINE_NOT_ELIGIBLE',
    'MANUAL_REVIEW'
  )),
  reason_summary TEXT NOT NULL,
  policy_code TEXT NOT NULL,
  flags JSONB NOT NULL DEFAULT '{}',
  next_actions JSONB NOT NULL DEFAULT '[]',
  audit JSONB NOT NULL,
  inputs_hash TEXT NOT NULL,
  base_amount_usd NUMERIC,
  remaining_amount_usd NUMERIC,
  evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, inputs_hash)
);

-- Enable RLS
ALTER TABLE public.dispute_decisions ENABLE ROW LEVEL SECURITY;

-- Customers can view their own decisions
CREATE POLICY "Customers can view their own decisions"
ON public.dispute_decisions
FOR SELECT
USING (auth.uid() = customer_id OR has_role(auth.uid(), 'bank_admin'::app_role));

-- System can insert decisions
CREATE POLICY "System can insert decisions"
ON public.dispute_decisions
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

-- Create index for idempotency lookups
CREATE INDEX idx_dispute_decisions_tx_hash ON public.dispute_decisions(transaction_id, inputs_hash);