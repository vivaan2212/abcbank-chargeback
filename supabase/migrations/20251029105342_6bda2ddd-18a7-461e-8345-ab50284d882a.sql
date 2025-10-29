-- Create chargeback_actions table to track chargeback filing decisions
CREATE TABLE public.chargeback_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id),
  customer_id UUID NOT NULL,
  
  -- Decision outcome
  action_type TEXT NOT NULL CHECK (action_type IN (
    'TEMPORARY_CREDIT_ONLY',
    'CHARGEBACK_FILED',
    'CHARGEBACK_NO_TEMP',
    'WAIT_FOR_REFUND',
    'WAIT_FOR_SETTLEMENT',
    'MANUAL_REVIEW',
    'EXPIRED_NOT_SETTLED'
  )),
  
  -- Transaction analysis fields
  net_amount NUMERIC NOT NULL,
  days_since_transaction INTEGER NOT NULL,
  days_since_settlement INTEGER,
  is_secured_otp BOOLEAN NOT NULL,
  is_unsecured BOOLEAN NOT NULL,
  is_magstripe BOOLEAN NOT NULL,
  is_chip BOOLEAN NOT NULL,
  is_contactless BOOLEAN NOT NULL,
  
  -- Decision factors
  merchant_category_code INTEGER NOT NULL,
  is_restricted_mcc BOOLEAN NOT NULL DEFAULT false,
  is_facebook_meta BOOLEAN NOT NULL DEFAULT false,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  
  -- Flags for admin dashboard
  temporary_credit_issued BOOLEAN NOT NULL DEFAULT false,
  chargeback_filed BOOLEAN NOT NULL DEFAULT false,
  awaiting_settlement BOOLEAN NOT NULL DEFAULT false,
  awaiting_merchant_refund BOOLEAN NOT NULL DEFAULT false,
  
  -- Internal notes (for bank admin dashboard only)
  internal_notes TEXT,
  admin_message TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_chargeback_actions_dispute ON public.chargeback_actions(dispute_id);
CREATE INDEX idx_chargeback_actions_customer ON public.chargeback_actions(customer_id);
CREATE INDEX idx_chargeback_actions_action_type ON public.chargeback_actions(action_type);
CREATE INDEX idx_chargeback_actions_created_at ON public.chargeback_actions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.chargeback_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Customers can view their own chargeback actions"
  ON public.chargeback_actions FOR SELECT
  USING (auth.uid() = customer_id OR has_role(auth.uid(), 'bank_admin'::app_role));

CREATE POLICY "System can insert chargeback actions"
  ON public.chargeback_actions FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Bank admins can update chargeback actions"
  ON public.chargeback_actions FOR UPDATE
  USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- Add trigger for updated_at timestamp
CREATE TRIGGER update_chargeback_actions_updated_at
  BEFORE UPDATE ON public.chargeback_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();