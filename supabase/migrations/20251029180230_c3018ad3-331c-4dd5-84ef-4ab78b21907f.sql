-- Update all transaction currencies from AED to USD
UPDATE transactions 
SET transaction_currency = 'USD',
    local_transaction_currency = 'USD'
WHERE transaction_currency = 'AED' 
   OR local_transaction_currency = 'AED';