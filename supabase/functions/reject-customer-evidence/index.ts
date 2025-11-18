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

    console.log(`Rejecting customer evidence for transaction: ${transaction_id}, evidence: ${customer_evidence_id}, user: ${user.id}`);

    // Validate inputs
    if (!transaction_id || !customer_evidence_id) {
      throw new Error('Missing required fields: transaction_id and customer_evidence_id');
    }

    // Verify evidence belongs to this transaction
    const { data: evidenceCheck, error: checkError } = await supabase
      .from('dispute_customer_evidence')
      .select('transaction_id')
      .eq('id', customer_evidence_id)
      .eq('transaction_id', transaction_id)
      .single();

    if (checkError || !evidenceCheck) {
      console.error('Evidence validation failed:', checkError);
      throw new Error('Invalid customer evidence ID for this transaction');
    }

    console.log('Evidence validation passed, fetching transaction details...');

    // Get transaction details
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('temporary_credit_provided, temporary_credit_amount, temporary_credit_currency, acquirer_name')
      .eq('id', transaction_id)
      .single();

    if (txError) {
      console.error('Failed to fetch transaction:', txError);
      throw txError;
    }

    console.log('Transaction details:', { 
      temporary_credit_provided: transaction?.temporary_credit_provided,
      temporary_credit_amount: transaction?.temporary_credit_amount,
      acquirer_name: transaction?.acquirer_name
    });

    // Determine card network from transaction
    let cardNetwork = 'visa'; // default lowercase for db
    if (transaction?.acquirer_name) {
      const acquirer = transaction.acquirer_name.toLowerCase().trim();
      if (acquirer.includes('mastercard') || acquirer === 'master card') {
        cardNetwork = 'mastercard';
      } else if (acquirer.includes('visa')) {
        cardNetwork = 'visa';
      }
    }

    console.log('Card network determined:', cardNetwork);

    console.log('Inserting review record...');

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

    if (reviewError) {
      console.error('Failed to insert review record:', reviewError);
      throw reviewError;
    }

    console.log('Review record inserted, updating representment status...');

    // Update representment status to customer_evidence_rejected (chargeback recalled)
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({ representment_status: 'customer_evidence_rejected' })
      .eq('transaction_id', transaction_id);

    if (repError) {
      console.error('Failed to update representment status:', repError);
      throw repError;
    }

    console.log('Representment status updated, updating transaction...');

    // Update transaction - reverse temporary credit if it was provided
    const updateData: any = {
      needs_attention: false,
      dispute_status: 'merchant_won'
    };

    if (transaction?.temporary_credit_provided) {
      // Reverse the temporary credit (take it back from customer)
      updateData.temporary_credit_provided = false;
      updateData.temporary_credit_reversal_at = new Date().toISOString();
      console.log('Reversing temporary credit...');
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
      throw updateError;
    }

    console.log('Transaction updated, logging action...');

    // Log action
    const { error: logError } = await supabase
      .from('dispute_action_log')
      .insert({
        transaction_id,
        action: 'chargeback_recalled',
        note: review_notes || 'Bank rejected customer evidence and recalled chargeback from card network',
        performed_by: user.id,
        network: cardNetwork
      });

    if (logError) {
      console.error('Failed to log action:', logError);
      throw logError;
    }

    console.log('Customer evidence rejected and chargeback recalled successfully');

    return new Response(JSON.stringify({ 
      success: true,
      credit_reversed: transaction?.temporary_credit_provided 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error rejecting customer evidence:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
