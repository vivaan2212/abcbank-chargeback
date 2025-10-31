import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { transaction_id, customer_evidence_id, review_notes } = await req.json();

    console.log(`Rejecting customer evidence for transaction: ${transaction_id}`);

    // Get transaction details
    const { data: transaction } = await supabase
      .from('transactions')
      .select('temporary_credit_provided, temporary_credit_amount, temporary_credit_currency')
      .eq('id', transaction_id)
      .single();

    // Insert review record
    const { error: reviewError } = await supabase
      .from('customer_evidence_reviews')
      .insert({
        transaction_id,
        customer_evidence_id,
        reviewed_by: user.id,
        review_decision: 'rejected',
        review_notes
      });

    if (reviewError) throw reviewError;

    // Update representment status to customer_evidence_rejected (chargeback recalled)
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({ representment_status: 'customer_evidence_rejected' })
      .eq('transaction_id', transaction_id);

    if (repError) throw repError;

    // Update transaction - make temporary credit permanent if it was provided
    const updateData: any = {
      needs_attention: false,
      dispute_status: 'merchant_won'
    };

    if (transaction?.temporary_credit_provided) {
      updateData.refund_received = true;
      updateData.refund_amount = transaction.temporary_credit_amount;
      updateData.temporary_credit_reversal_at = new Date().toISOString();
    }

    await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transaction_id);

    // Log action
    await supabase
      .from('dispute_action_log')
      .insert({
        transaction_id,
        action: 'chargeback_recalled',
        note: review_notes || 'Bank rejected customer evidence and recalled chargeback from card network',
        performed_by: user.id,
        network: 'visa'
      });

    console.log('Customer evidence rejected and chargeback recalled');

    return new Response(JSON.stringify({ 
      success: true,
      credit_made_permanent: transaction?.temporary_credit_provided 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error rejecting customer evidence:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
