import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transaction_id, admin_notes } = await req.json();

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'transaction_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Closing case after insufficient customer evidence:', transaction_id);

    // Get transaction data
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', txError);
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if temporary credit was provided
    const creditReversed = transaction.temporary_credit_provided === true;

    // Update representment status to accepted_by_bank (merchant wins)
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({
        representment_status: 'accepted_by_bank',
        updated_at: new Date().toISOString(),
      })
      .eq('transaction_id', transaction_id);

    if (repError) {
      console.error('Failed to update representment:', repError);
      return new Response(
        JSON.stringify({ error: 'Failed to update representment status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update transaction status and reverse credit if applicable
    const updateData: any = {
      dispute_status: 'closed_lost',
      needs_attention: false,
    };

    if (creditReversed) {
      updateData.temporary_credit_provided = false;
      updateData.temporary_credit_reversal_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the action
    await supabase.from('dispute_action_log').insert({
      transaction_id: transaction_id,
      action: 'closed_after_insufficient_customer_evidence',
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      note: admin_notes || 'Case closed due to insufficient customer evidence. Merchant representment accepted.',
    });

    // Get dispute and conversation for customer notification
    const { data: dispute } = await supabase
      .from('disputes')
      .select('id, conversation_id')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (dispute?.conversation_id) {
      // Send notification to customer
      const customerMessage = `Your dispute for transaction ${transaction.transaction_id} (${transaction.merchant_name}, ${transaction.transaction_currency} ${transaction.transaction_amount}) has been reviewed.

Unfortunately, the documents you provided do not meet the criteria for continuing the dispute. The merchant's response will be upheld, and the case is now closed.${
        creditReversed
          ? '\n\nPlease note: Any temporary credit provided earlier has been reversed.'
          : ''
      }

If you believe this decision is incorrect, please contact support.`;

      await supabase.from('messages').insert({
        conversation_id: dispute.conversation_id,
        role: 'assistant',
        content: customerMessage,
      });
    }

    console.log('Case closed successfully. Credit reversed:', creditReversed);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Case closed. Merchant wins.',
        credit_reversed: creditReversed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in close-after-customer-evidence:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});