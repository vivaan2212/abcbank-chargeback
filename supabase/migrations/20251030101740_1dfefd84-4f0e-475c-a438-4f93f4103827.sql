-- Create enum for representment status
CREATE TYPE representment_status_enum AS ENUM (
  'no_representment',
  'pending',
  'accepted_by_bank',
  'awaiting_customer_info',
  'rejected_by_bank'
);

-- Create the chargeback_representment_static table
CREATE TABLE public.chargeback_representment_static (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL,
  will_be_represented BOOLEAN NOT NULL DEFAULT false,
  representment_status representment_status_enum NOT NULL DEFAULT 'no_representment',
  merchant_document_url TEXT,
  merchant_reason_text TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_transaction FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  CONSTRAINT unique_transaction_id UNIQUE (transaction_id)
);

-- Enable RLS
ALTER TABLE public.chargeback_representment_static ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Customers can view their own representment data"
  ON public.chargeback_representment_static
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = chargeback_representment_static.transaction_id
        AND (t.customer_id = auth.uid() OR has_role(auth.uid(), 'bank_admin'::app_role))
    )
  );

CREATE POLICY "System can insert representment records"
  ON public.chargeback_representment_static
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = chargeback_representment_static.transaction_id
        AND t.customer_id = auth.uid()
    )
  );

CREATE POLICY "Bank admins can update representment records"
  ON public.chargeback_representment_static
  FOR UPDATE
  USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_representment_updated_at
  BEFORE UPDATE ON public.chargeback_representment_static
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing transactions
INSERT INTO public.chargeback_representment_static (transaction_id, will_be_represented, representment_status)
SELECT t.id, false, 'no_representment'::representment_status_enum
FROM public.transactions t
LEFT JOIN public.chargeback_representment_static r ON r.transaction_id = t.id
WHERE r.transaction_id IS NULL;

-- Function to auto-create representment record on transaction insert
CREATE OR REPLACE FUNCTION public.create_representment_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chargeback_representment_static (transaction_id, will_be_represented, representment_status)
  VALUES (NEW.id, false, 'no_representment')
  ON CONFLICT (transaction_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger to auto-create representment record
CREATE TRIGGER auto_create_representment
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_representment_record();