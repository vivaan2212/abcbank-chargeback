-- Create table for customer evidence reviews by bank admins
CREATE TABLE public.customer_evidence_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL,
  customer_evidence_id UUID NOT NULL,
  reviewed_by UUID NOT NULL,
  review_decision TEXT NOT NULL CHECK (review_decision IN ('approved', 'rejected')),
  review_notes TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_evidence_reviews ENABLE ROW LEVEL SECURITY;

-- Customers and admins can view reviews
CREATE POLICY "Customers and admins can view reviews"
ON public.customer_evidence_reviews
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = customer_evidence_reviews.transaction_id
    AND (t.customer_id = auth.uid() OR has_role(auth.uid(), 'bank_admin'::app_role))
  )
);

-- Bank admins can insert reviews
CREATE POLICY "Bank admins can insert reviews"
ON public.customer_evidence_reviews
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'bank_admin'::app_role));

-- Add new representment status values for customer evidence flow
ALTER TYPE representment_status_enum ADD VALUE IF NOT EXISTS 'customer_evidence_approved';
ALTER TYPE representment_status_enum ADD VALUE IF NOT EXISTS 'customer_evidence_rejected';
ALTER TYPE representment_status_enum ADD VALUE IF NOT EXISTS 'rebuttal_submitted';
ALTER TYPE representment_status_enum ADD VALUE IF NOT EXISTS 'rebuttal_accepted';