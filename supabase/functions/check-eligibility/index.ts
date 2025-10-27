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
  created_at: string;
}

const MAX_AGE_DAYS = 120;
const MIN_AMOUNT_AED = 15;
const SECURED_INDICATIONS = [2, 212]; // OTP-secured
const SECURE_POS_ENTRY = [5, 7]; // Chip / Contactless
const WALLET_TYPES = ['Apple Pay', 'Google Pay'];
const MAX_SETTLEMENT_DAYS = 21;

function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
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

    // 1. Refund already received or fully reversed
    if (tx.refund_received === true || (tx.transaction_amount - (tx.refund_amount || 0)) <= 0) {
      ineligibleReasons.push('Refund already received or transaction fully reversed.');
    }

    // 2. Amount below threshold
    if (tx.local_transaction_amount < MIN_AMOUNT_AED) {
      ineligibleReasons.push(`Transaction amount below ${MIN_AMOUNT_AED} AED minimum threshold.`);
    }

    // 3. Transaction older than allowed window
    const transactionAge = daysSince(tx.transaction_time);
    if (transactionAge > MAX_AGE_DAYS) {
      ineligibleReasons.push(`Transaction is older than ${MAX_AGE_DAYS} days and cannot be disputed.`);
    }

    console.log(`Transaction age: ${transactionAge} days, Ineligible reasons: ${ineligibleReasons.length}`);

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
