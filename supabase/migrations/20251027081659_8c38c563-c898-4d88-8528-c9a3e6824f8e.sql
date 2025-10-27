-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id BIGINT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_time TIMESTAMP WITH TIME ZONE NOT NULL,
  transaction_amount DECIMAL(10, 2) NOT NULL,
  transaction_currency TEXT NOT NULL,
  is_wallet_transaction BOOLEAN NOT NULL DEFAULT false,
  secured_indication INTEGER NOT NULL,
  pos_entry_mode INTEGER NOT NULL,
  local_transaction_currency TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  wallet_type TEXT,
  acquirer_name TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  local_transaction_amount DECIMAL(10, 2) NOT NULL,
  merchant_category_code INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
ON public.transactions
FOR SELECT
USING (auth.uid() = customer_id);

-- Create index for performance
CREATE INDEX idx_transactions_customer_time ON public.transactions(customer_id, transaction_time DESC);