-- Add settled and settlement_date columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN settled boolean NOT NULL DEFAULT false,
ADD COLUMN settlement_date timestamp with time zone;

-- Optionally, you can set settled to true for older transactions
-- For example, transactions older than 3 days could be considered settled
UPDATE public.transactions 
SET settled = true,
    settlement_date = transaction_time + interval '3 days'
WHERE transaction_time < NOW() - interval '3 days';

-- Add an index for better query performance on settled status
CREATE INDEX idx_transactions_settled ON public.transactions(settled);
CREATE INDEX idx_transactions_settlement_date ON public.transactions(settlement_date);