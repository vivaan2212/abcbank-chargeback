-- Create merchant_response_config table
CREATE TABLE public.merchant_response_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  will_representment BOOLEAN NOT NULL,
  response_reason_code TEXT,
  response_reason_text TEXT,
  response_document_url TEXT,
  response_delay_days INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.merchant_response_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Bank admins can view all configs"
  ON public.merchant_response_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'bank_admin'
    )
  );

CREATE POLICY "Bank admins can manage configs"
  ON public.merchant_response_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'bank_admin'
    )
  );

CREATE POLICY "Customers can view their own transaction configs"
  ON public.merchant_response_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions
      WHERE transactions.id = merchant_response_config.transaction_id
        AND transactions.customer_id = auth.uid()
    )
  );

-- Populate static configuration data for the 6 actual transactions

-- Transactions with representment (will_representment = true)

-- 1. Amazon.ae - $459.99
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_reason_code, 
  response_reason_text, response_delay_days
) VALUES (
  '3cce322e-e7c2-4ed6-9682-bff67fc952f9',
  true,
  '13.2',
  'Goods/Services provided as described. Customer signed delivery confirmation with tracking number AE-2024-45678.',
  3
);

-- 2. Noon.com - $89.99
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_reason_code,
  response_reason_text, response_delay_days
) VALUES (
  '5103243e-317d-47ce-b6cf-3828645c2709',
  true,
  '13.5',
  'Customer authenticated transaction via OTP. Delivery confirmed to registered address with photographic proof.',
  2
);

-- 3. Carrefour - $234.50
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_reason_code,
  response_reason_text, response_delay_days
) VALUES (
  '996d0885-9623-4694-bfa8-135db5e25422',
  true,
  '13.7',
  'In-store purchase with chip card authentication. Receipt signed by cardholder. CCTV footage available.',
  4
);

-- Transactions where merchant accepts (will_representment = false)

-- 4. Netflix - $15.99
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_delay_days
) VALUES (
  '05390f3c-90d4-4d78-9b62-5957d2337545',
  false,
  2
);

-- 5. Coffee Shop - $12.50
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_delay_days
) VALUES (
  '7fff1b63-73bf-4695-9b59-947b37b10efb',
  false,
  1
);

-- 6. Starbucks - $8.75
INSERT INTO public.merchant_response_config (
  transaction_id, will_representment, response_delay_days
) VALUES (
  '3b7cc124-2460-41d1-9df7-8cd23d5d4897',
  false,
  2
);