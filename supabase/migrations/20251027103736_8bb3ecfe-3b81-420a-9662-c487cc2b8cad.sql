-- Delete all transactions for Prabhu Sachdeva
DELETE FROM transactions WHERE customer_id = 'f949863f-9fec-464f-919a-76533f030142';

-- Add 3 new transactions for Prabhu Sachdeva
INSERT INTO transactions (
  customer_id, transaction_id, merchant_name, merchant_id, merchant_category_code,
  transaction_amount, transaction_currency, local_transaction_amount, local_transaction_currency,
  transaction_time, acquirer_name, is_wallet_transaction, wallet_type,
  secured_indication, pos_entry_mode, refund_received, refund_amount
) VALUES
-- Eligible 1: Carrefour shopping with OTP
(
  'f949863f-9fec-464f-919a-76533f030142', 300001, 'Carrefour', 7001, 5411,
  275.00, 'AED', 275.00, 'AED',
  NOW() - INTERVAL '20 days', 'Visa', false, null,
  2, 5, false, 0
),
-- Eligible 2: Amazon purchase with chip
(
  'f949863f-9fec-464f-919a-76533f030142', 300002, 'Amazon.ae', 7002, 5942,
  189.50, 'AED', 189.50, 'AED',
  NOW() - INTERVAL '35 days', 'Mastercard', false, null,
  212, 5, false, 0
),
-- Ineligible: Apple Pay transaction without OTP (secured but non-OTP)
(
  'f949863f-9fec-464f-919a-76533f030142', 300003, 'Starbucks', 7003, 5814,
  45.00, 'AED', 45.00, 'AED',
  NOW() - INTERVAL '10 days', 'Visa', true, 'Apple Pay',
  0, 7, false, 0
);