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

    console.log(`Approving customer evidence for transaction: ${transaction_id}, evidence: ${customer_evidence_id}, user: ${user.id}`);

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

    console.log('Evidence validation passed, inserting review record...');

    // Insert review record
    const { error: reviewError } = await supabase
      .from('customer_evidence_reviews')
      .insert({
        transaction_id,
        customer_evidence_id,
        reviewed_by: user.id,
        review_decision: 'approved',
        review_notes
      });

    if (reviewError) {
      console.error('Failed to insert review record:', reviewError);
      throw reviewError;
    }

    console.log('Review record inserted, updating representment status...');

    // Update representment status to rebuttal_submitted
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({ representment_status: 'rebuttal_submitted' })
      .eq('transaction_id', transaction_id);

    if (repError) {
      console.error('Failed to update representment status:', repError);
      throw repError;
    }

    console.log('Representment status updated, logging action...');

    // Log action
    const { error: logError } = await supabase
      .from('dispute_action_log')
      .insert({
        transaction_id,
        action: 'rebuttal_submitted',
        note: review_notes || 'Bank approved customer evidence and submitted rebuttal to card network',
        performed_by: user.id,
        network: 'visa'
      });

    if (logError) {
      console.error('Failed to log action:', logError);
      throw logError;
    }

    console.log('Customer evidence approved and rebuttal submitted successfully');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error approving customer evidence:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
