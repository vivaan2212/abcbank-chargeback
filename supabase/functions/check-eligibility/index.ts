import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  id: string;
  transaction_id: number;
  transaction_time: string;
  transaction_amount: number;
  transaction_currency: string;
  local_transaction_amount: number;
  local_transaction_currency: string;
  merchant_name: string;
  merchant_id: number;
  merchant_category_code: number;
  acquirer_name: string;
  is_wallet_transaction: boolean;
  wallet_type: string | null;
  secured_indication: number;
  pos_entry_mode: number;
  refund_received: boolean;
  refund_amount: number;
  settled: boolean;
  settlement_date: string | null;
  created_at: string;
}

const MIN_AMOUNT_USD = 15; // For internal flagging only
const SECURED_INDICATIONS = [2, 212]; // OTP-secured
const WALLET_TYPES = ['Apple Pay', 'Google Pay'];

function calculateDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user from JWT token
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get transaction ID from request body
    const { transactionId } = await req.json();

    if (!transactionId) {
      console.error('Transaction ID is missing from request body');
      return new Response(
        JSON.stringify({ error: 'Transaction ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Checking eligibility for transaction: ${transactionId}`);

    // Fetch transaction from database
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('customer_id', user.id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction fetch error:', txError);
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tx = transaction as unknown as Transaction;
    const ineligibleReasons: string[] = [];

    // Check if transaction is settled - block unsettled transactions early
    if (!tx.settled) {
      const days_since_tx = calculateDaysSince(tx.transaction_time);
      
      if (days_since_tx < 3) {
        ineligibleReasons.push('Transaction is not yet settled. Settlement typically takes 2-3 business days. Please try again after settlement.');
      } else if (days_since_tx > 21) {
        ineligibleReasons.push('Transaction has been pending settlement for an unusually long time (>21 days). Please contact customer support for assistance.');
      } else {
        ineligibleReasons.push('Transaction is not yet settled. Please try again in a few days once the transaction has been settled by the merchant.');
      }
    }

    // Calculate base_amount: Use local_transaction_amount if it's in USD and > 0, otherwise use transaction_amount
    const localAmount = Number(tx.local_transaction_amount ?? 0);
    const origAmount = Number(tx.transaction_amount ?? 0);
    const isLocalUSD = tx.local_transaction_currency === 'USD';
    const base_amount = (isLocalUSD && localAmount > 0) ? localAmount : origAmount;
    const refund_amount = Number(tx.refund_amount ?? 0);
    const remaining_amount = base_amount - refund_amount;

    // Internal flag for small transactions (not shown to customer)
    const writeOffRecommended = base_amount < MIN_AMOUNT_USD;

    // 1. Fully/Over-Refunded Transactions
    if (tx.refund_received === true && remaining_amount <= 0) {
      ineligibleReasons.push('Refund received in full. No remaining amount to dispute.');
    }

    // 2. Secured Non-OTP Wallet Transactions
    const isSecuredWallet = tx.is_wallet_transaction && 
                            WALLET_TYPES.includes(tx.wallet_type || '') && 
                            !SECURED_INDICATIONS.includes(tx.secured_indication);
    if (isSecuredWallet) {
      ineligibleReasons.push('Secured non-OTP digital wallet transaction. Not eligible for chargeback.');
    }

    console.log(`Transaction check: base_amount=${base_amount}, remaining=${remaining_amount}, writeOffRecommended=${writeOffRecommended}, wallet=${tx.wallet_type}, secured=${tx.secured_indication}, ineligible=${ineligibleReasons.length}`);

    // Return result
    if (ineligibleReasons.length > 0) {
      return new Response(
        JSON.stringify({
          transactionId: tx.id,
          status: 'INELIGIBLE',
          ineligibleReasons,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        transactionId: tx.id,
        status: 'ELIGIBLE',
        ...(writeOffRecommended && { writeOffRecommended: true }),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in check-eligibility function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
