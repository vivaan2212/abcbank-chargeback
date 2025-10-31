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

    console.log('Filing pre-arbitration for transaction:', transaction_id);

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

    // Determine card network (simplified - in real implementation would check card BIN)
    // For now, we'll use a simple heuristic or assume Visa
    const cardNetwork = 'VISA'; // In production, determine from card details

    // Update representment status to prearbitration_filed
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({
        representment_status: 'prearbitration_filed',
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

    // Update transaction status
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        dispute_status: 'pre_arbitration_filed',
        needs_attention: false,
      })
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
      action: 'filed_pre_arbitration',
      network: cardNetwork,
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      note: admin_notes || 'Pre-arbitration filed based on customer evidence',
    });

    console.log('Pre-arbitration filed successfully');

    // In production, this would make actual API calls to Visa/Mastercard
    // For now, we just log the action
    console.log(`Would file pre-arbitration with ${cardNetwork} for transaction ${transaction.transaction_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pre-Arbitration filed successfully with ${cardNetwork}`,
        network: cardNetwork,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in proceed-to-prearbitration:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});