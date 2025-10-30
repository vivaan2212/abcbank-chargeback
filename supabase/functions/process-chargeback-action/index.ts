import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESTRICTED_MCCS = [5968, 4215, 5815, 6300, 5411, 7922, 7011, 4121, 4722, 9399, 4814, 7375, 7394, 4899, 7997];
const SECURED_INDICATIONS = [2, 212];
const MAGSTRIPE_POS_MODES = [90, 91];

interface Transaction {
  id: string;
  transaction_amount: number;
  transaction_currency: string;
  local_transaction_amount: number;
  local_transaction_currency: string;
  refund_amount: number;
  refund_received: boolean;
  secured_indication: number;
  is_wallet_transaction: boolean;
  wallet_type: string | null;
  pos_entry_mode: number;
  settled: boolean;
  settlement_date: string | null;
  transaction_time: string;
  merchant_name: string;
  merchant_category_code: number;
  customer_id: string;
  acquirer_name: string;
}

function calculateDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const { disputeId, transactionId } = await req.json();

    if (!disputeId || !transactionId) {
      throw new Error('Missing disputeId or transactionId');
    }

    console.log(`Processing chargeback action for dispute: ${disputeId}, transaction: ${transactionId}`);

    // Fetch transaction details
    const { data: transaction, error: txError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('customer_id', user.id)
      .single();

    if (txError || !transaction) {
      throw new Error('Transaction not found');
    }

    const tx = transaction as unknown as Transaction;

    // Calculate derived values
    const localAmount = Number(tx.local_transaction_amount ?? 0);
    const origAmount = Number(tx.transaction_amount ?? 0);
    const isLocalUSD = tx.local_transaction_currency === 'USD';
    const base_amount = (isLocalUSD && localAmount > 0) ? localAmount : origAmount;
    const refund_amount = Number(tx.refund_amount ?? 0);
    const net_amount = base_amount - refund_amount;

    const days_since_transaction = calculateDaysSince(tx.transaction_time);
    const days_since_settlement = tx.settled && tx.settlement_date ? calculateDaysSince(tx.settlement_date) : null;

    const is_secured_otp = SECURED_INDICATIONS.includes(tx.secured_indication);
    const is_unsecured = !is_secured_otp && !tx.is_wallet_transaction;
    const is_magstripe = MAGSTRIPE_POS_MODES.includes(tx.pos_entry_mode);
    const is_chip = tx.pos_entry_mode === 5;
    const is_contactless = tx.pos_entry_mode === 7;
    const is_restricted_mcc = RESTRICTED_MCCS.includes(tx.merchant_category_code);
    const merchant_lower = tx.merchant_name.toLowerCase();
    const is_facebook_meta = merchant_lower.includes('facebook') || merchant_lower.includes('meta');

    console.log(`Analysis: net=${net_amount}, days_tx=${days_since_transaction}, days_settle=${days_since_settlement}, otp=${is_secured_otp}, unsecured=${is_unsecured}, magstripe=${is_magstripe}, mcc=${tx.merchant_category_code}, fb=${is_facebook_meta}`);

    // Decision Logic - Priority Order Matters!
    let action_type: string;
    let admin_message: string;
    let temporary_credit_issued = false;
    let chargeback_filed = false;
    let awaiting_settlement = false;
    let awaiting_merchant_refund = false;
    let requires_manual_review = false;

    // Case 5: Magstripe/Manual Entry → Manual Review
    if (is_magstripe) {
      action_type = 'MANUAL_REVIEW';
      admin_message = 'Magstripe/manual entry transaction requires manual review before filing chargeback.';
      requires_manual_review = true;
    }
    // Case 4: Facebook/Meta waiting period
    else if (is_facebook_meta && days_since_settlement !== null && days_since_settlement < 7) {
      action_type = 'WAIT_FOR_REFUND';
      admin_message = `Facebook/Meta transaction - waiting 7 days for automatic refund (${days_since_settlement} days elapsed, ${7 - days_since_settlement} days remaining).`;
      awaiting_merchant_refund = true;
    }
    // Case 1: OTP/3D Secure → Temporary Credit Only
    else if (is_secured_otp) {
      action_type = 'TEMPORARY_CREDIT_ONLY';
      admin_message = 'OTP-secured transaction - temporary credit issued. Case under investigation.';
      temporary_credit_issued = true;
    }
    // Case 3: Restricted MCC → Chargeback without Temp Credit
    else if (is_restricted_mcc) {
      action_type = 'CHARGEBACK_NO_TEMP';
      admin_message = `High-risk merchant category (MCC: ${tx.merchant_category_code}) - chargeback filed without temporary credit as per policy.`;
      chargeback_filed = true;
    }
    // Case 2: Unsecured → Chargeback Filed with Temp Credit
    else if (is_unsecured) {
      action_type = 'CHARGEBACK_FILED';
      admin_message = 'Unsecured transaction - chargeback filed successfully with temporary credit issued.';
      chargeback_filed = true;
      temporary_credit_issued = true;
    }
    // Fallback for edge cases
    else {
      action_type = 'MANUAL_REVIEW';
      admin_message = 'Transaction requires manual review due to unclassified security parameters.';
      requires_manual_review = true;
    }

    console.log(`Decision: action=${action_type}, temp_credit=${temporary_credit_issued}, chargeback=${chargeback_filed}`);

    // Get video reference for chargeback filing
    let video_id: string | null = null;
    if (chargeback_filed) {
      const cardNetwork = tx.acquirer_name?.toLowerCase().includes('visa') 
        ? 'Visa' 
        : tx.acquirer_name?.toLowerCase().includes('mastercard') 
        ? 'Mastercard' 
        : null;

      if (cardNetwork) {
        const { data: video } = await supabase
          .from('chargeback_videos')
          .select('id')
          .eq('card_network', cardNetwork)
          .eq('is_active', true)
          .maybeSingle();
        
        video_id = video?.id || null;
        console.log(`Card network: ${cardNetwork}, Video ID: ${video_id}`);
      }
    }

    // Insert chargeback action record using service role to bypass RLS
    const { data: chargebackAction, error: insertError } = await supabase
      .from('chargeback_actions')
      .insert({
        dispute_id: disputeId,
        transaction_id: transactionId,
        customer_id: user.id,
        action_type,
        net_amount,
        days_since_transaction,
        days_since_settlement,
        is_secured_otp,
        is_unsecured,
        is_magstripe,
        is_chip,
        is_contactless,
        merchant_category_code: tx.merchant_category_code,
        is_restricted_mcc,
        is_facebook_meta,
        requires_manual_review,
        temporary_credit_issued,
        chargeback_filed,
        awaiting_settlement,
        awaiting_merchant_refund,
        admin_message,
        video_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting chargeback action:', insertError);
      throw insertError;
    }

    // Update transaction with chargeback details
    if (chargeback_filed) {
      const { error: txUpdateError } = await supabase
        .from('transactions')
        .update({
          dispute_status: 'chargeback_filed',
          chargeback_case_id: chargebackAction.id,
          temporary_credit_provided: temporary_credit_issued,
          temporary_credit_amount: temporary_credit_issued ? net_amount : 0,
          temporary_credit_currency: tx.transaction_currency
        })
        .eq('id', transactionId);

      if (txUpdateError) {
        console.error('Error updating transaction status:', txUpdateError);
      }
    }

    console.log(`Chargeback action created successfully: ${chargebackAction.id}`);

    // Ensure representment record exists for this transaction
    const { data: existingRep } = await supabase
      .from('chargeback_representment_static')
      .select('id')
      .eq('transaction_id', transactionId)
      .maybeSingle();

    if (!existingRep) {
      console.log('Creating representment record for transaction:', transactionId);
      await supabase
        .from('chargeback_representment_static')
        .insert({
          transaction_id: transactionId,
          will_be_represented: false,
          representment_status: 'no_representment',
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        actionType: action_type,
        actionId: chargebackAction.id,
        temporaryCreditIssued: temporary_credit_issued,
        chargebackFiled: chargeback_filed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in process-chargeback-action:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
