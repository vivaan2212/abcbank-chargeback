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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication and admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Check if user has bank_admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'bank_admin')
      .maybeSingle();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transaction_id, admin_notes } = await req.json();

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'transaction_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Rejecting representment for transaction:', transaction_id);

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

    // Get dispute data
    const { data: dispute } = await supabase
      .from('disputes')
      .select('id, conversation_id')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    // Update representment status to awaiting customer info
    const { error: repError } = await supabase
      .from('chargeback_representment_static')
      .update({
        representment_status: 'awaiting_customer_info',
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

    // Update transaction - keep in needs attention until workflow complete
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        dispute_status: 'awaiting_customer_info',
        needs_attention: true,
      })
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create evidence request record
    await supabase
      .from('dispute_customer_evidence_request')
      .insert({
        transaction_id: transaction_id,
        customer_id: transaction.customer_id,
        status: 'pending_upload',
        note: 'Bank requested customer communication evidence after merchant representment',
      });

    // Create or reopen conversation for customer
    let conversationId = dispute?.conversation_id;

    if (!conversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: transaction.customer_id,
          title: `Representment - Transaction ${transaction.transaction_id}`,
          status: 'active',
        })
        .select()
        .single();

      if (convError) {
        console.error('Failed to create conversation:', convError);
      } else {
        conversationId = newConv.id;
        // Link conversation to dispute
        if (dispute) {
          await supabase
            .from('disputes')
            .update({ conversation_id: conversationId })
            .eq('id', dispute.id);
        }
      }
    } else {
      // Reactivate existing conversation
      await supabase
        .from('conversations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    }

    // Send message to customer via conversation
    if (conversationId) {
      const customerMessage = `Your transaction ${transaction.transaction_id} for ${transaction.transaction_currency} ${transaction.transaction_amount} with ${transaction.merchant_name} has been represented by the merchant.

To continue supporting your dispute, please share any additional communication with the merchant (emails, chats, delivery proof, refund denials).

You can upload files or paste text here.`;

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: customerMessage,
      });

      console.log('Customer message sent to conversation:', conversationId);
    }

    // Log to chargeback_actions
    if (dispute) {
      await supabase.from('chargeback_actions').insert({
        dispute_id: dispute.id,
        transaction_id: transaction_id,
        customer_id: transaction.customer_id,
        action_type: 'representment_rejected',
        admin_message: 'Bank rejected merchant representment. Requesting additional customer evidence.',
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

    console.log('Successfully rejected representment and requested customer info');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Representment rejected. Customer has been notified.',
        conversation_id: conversationId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in reject-representment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
