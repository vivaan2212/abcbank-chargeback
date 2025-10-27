
-- Delete all existing transactions
DELETE FROM transactions;

-- Add 3 transactions for Pratyush Kumar Purohit (user_id: 7cc860f5-9f2d-46f0-ae52-1a396cb556a9)
INSERT INTO transactions (
  customer_id, transaction_id, merchant_name, merchant_id, merchant_category_code,
  transaction_amount, transaction_currency, local_transaction_amount, local_transaction_currency,
  transaction_time, acquirer_name, is_wallet_transaction, wallet_type,
  secured_indication, pos_entry_mode, refund_received, refund_amount
) VALUES
-- Eligible 1: Netflix subscription
(
  '7cc860f5-9f2d-46f0-ae52-1a396cb556a9', 100001, 'Netflix', 5001, 7841,
  55.00, 'USD', 202.00, 'AED',
  NOW() - INTERVAL '30 days', 'Visa', false, null,
  0, 1, false, 0
),
-- Eligible 2: Noon.com purchase
(
  '7cc860f5-9f2d-46f0-ae52-1a396cb556a9', 100002, 'Noon.com', 5002, 5999,
  299.50, 'AED', 299.50, 'AED',
  NOW() - INTERVAL '45 days', 'Mastercard', false, null,
  2, 5, false, 0
),
-- Ineligible: Amount too low (below 15 AED)
(
  '7cc860f5-9f2d-46f0-ae52-1a396cb556a9', 100003, 'Coffee Shop', 5003, 5812,
  10.00, 'AED', 10.00, 'AED',
  NOW() - INTERVAL '20 days', 'Visa', false, null,
  0, 1, false, 0
);

-- Add 3 transactions for Prabhu Sachdeva (user_id: f949863f-9fec-464f-919a-76533f030142)
INSERT INTO transactions (
  customer_id, transaction_id, merchant_name, merchant_id, merchant_category_code,
  transaction_amount, transaction_currency, local_transaction_amount, local_transaction_currency,
  transaction_time, acquirer_name, is_wallet_transaction, wallet_type,
  secured_indication, pos_entry_mode, refund_received, refund_amount
) VALUES
-- Eligible 1: Dubai Mall shopping
(
  'f949863f-9fec-464f-919a-76533f030142', 200001, 'Dubai Mall', 6001, 5311,
  450.00, 'AED', 450.00, 'AED',
  NOW() - INTERVAL '25 days', 'Visa', false, null,
  2, 7, false, 0
),
-- Eligible 2: Uber ride
(
  'f949863f-9fec-464f-919a-76533f030142', 200002, 'Uber', 6002, 4121,
  85.50, 'AED', 85.50, 'AED',
  NOW() - INTERVAL '15 days', 'Mastercard', true, 'Apple Pay',
  2, 7, false, 0
),
-- Ineligible: Transaction too old (over 120 days)
(
  'f949863f-9fec-464f-919a-76533f030142', 200003, 'Old Store', 6003, 5411,
  125.00, 'AED', 125.00, 'AED',
  NOW() - INTERVAL '150 days', 'Visa', false, null,
  0, 1, false, 0
);
