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

    const { transaction_id, admin_notes } = await req.json();

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'transaction_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Accepting representment for transaction:', transaction_id);

    // Get transaction and representment data
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, chargeback_representment_static(*)')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', txError);
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update representment status
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

    // Prepare transaction updates
    const transactionUpdates: any = {
      dispute_status: 'closed_lost',
      needs_attention: false,
    };

    // Handle temporary credit reversal if credit was provided
    if (transaction.temporary_credit_provided) {
      transactionUpdates.temporary_credit_provided = false;
      transactionUpdates.temporary_credit_reversal_at = new Date().toISOString();
      console.log('Reversing temporary credit for transaction:', transaction_id);
    }

    // Update transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update(transactionUpdates)
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current user (admin who is accepting)
    const { data: { user } } = await supabase.auth.getUser();

    // Log to chargeback_actions if there's a dispute_id
    const { data: dispute } = await supabase
      .from('disputes')
      .select('id')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (dispute) {
      await supabase.from('chargeback_actions').insert({
        dispute_id: dispute.id,
        transaction_id: transaction_id,
        customer_id: transaction.customer_id,
        action_type: 'representment_accepted',
        admin_message: 'Bank accepted merchant representment. Merchant wins.',
        internal_notes: admin_notes || null,
        net_amount: transaction.transaction_amount,
        days_since_transaction: Math.floor(
          (new Date().getTime() - new Date(transaction.transaction_time).getTime()) / (1000 * 60 * 60 * 24)
        ),
        days_since_settlement: transaction.settlement_date
          ? Math.floor(
              (new Date().getTime() - new Date(transaction.settlement_date).getTime()) / (1000 * 60 * 60 * 24)
            )
          : null,
        is_secured_otp: transaction.secured_indication === 10,
        is_unsecured: transaction.secured_indication === 0,
        is_magstripe: transaction.pos_entry_mode === 90,
        is_chip: transaction.pos_entry_mode === 5,
        is_contactless: transaction.pos_entry_mode === 7 || transaction.pos_entry_mode === 91,
        merchant_category_code: transaction.merchant_category_code,
        temporary_credit_issued: false,
      });
    }

    // Log to representment_audit_log
    await supabase.from('representment_audit_log').insert({
      transaction_id: transaction_id,
      action: 'accept',
      performed_by: user?.id || null,
      admin_notes: admin_notes || null,
      merchant_document_url: transaction.chargeback_representment_static?.[0]?.merchant_document_url || null,
    });

    console.log('Successfully accepted representment');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Representment accepted. Merchant wins.',
        credit_reversed: transaction.temporary_credit_provided,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in accept-representment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
