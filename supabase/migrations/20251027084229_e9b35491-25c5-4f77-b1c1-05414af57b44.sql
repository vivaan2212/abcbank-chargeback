-- Add refund fields to transactions table
ALTER TABLE public.transactions
ADD COLUMN refund_received boolean NOT NULL DEFAULT false,
ADD COLUMN refund_amount numeric NOT NULL DEFAULT 0;

-- Update existing transactions with default refund values (already handled by DEFAULT)
-- But explicitly set them for clarity
UPDATE public.transactions
SET refund_received = false,
    refund_amount = 0
WHERE refund_received IS NULL OR refund_amount IS NULL;