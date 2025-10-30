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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is bank_admin
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'bank_admin')
      .maybeSingle();

    if (roleError || !userRole) {
      return new Response(JSON.stringify({ error: 'Only bank admins can accept representments' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { transaction_id, notes } = await req.json();

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'transaction_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Accepting representment for transaction: ${transaction_id}`);

    // Fetch transaction with representment data
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, merchant_representments(*)')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', txError);
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate dispute status
    if (transaction.dispute_status !== 'representment_received') {
      return new Response(JSON.stringify({ 
        error: 'Action not allowed in current state',
        current_status: transaction.dispute_status 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const representment = transaction.merchant_representments?.[0];
    let creditReversalResult = null;

    // Check if temporary credit needs to be reversed
    if (transaction.temporary_credit_provided) {
      console.log(`Reversing temporary credit: ${transaction.temporary_credit_amount} ${transaction.temporary_credit_currency}`);

      // TODO: Create ledger/transaction entry in accounting system
      // This would create a reversal entry:
      // - type: "TEMP_CREDIT_REVERSAL"
      // - amount: transaction.temporary_credit_amount
      // - currency: transaction.temporary_credit_currency
      // - linked_transaction_id: transaction_id
      // - reason: "Merchant representment accepted by bank"

      creditReversalResult = {
        reversed: true,
        amount: transaction.temporary_credit_amount,
        currency: transaction.temporary_credit_currency,
        reversed_at: new Date().toISOString()
      };

      // Update transaction to mark credit as reversed
      const { error: creditUpdateError } = await supabase
        .from('transactions')
        .update({
          temporary_credit_provided: false,
          temporary_credit_reversal_at: new Date().toISOString()
        })
        .eq('id', transaction_id);

      if (creditUpdateError) {
        console.error('Error reversing credit:', creditUpdateError);
        // Keep transaction in needs_attention with sub-status
        const { error: statusUpdateError } = await supabase
          .from('transactions')
          .update({
            dispute_status: 'representment_received',
            needs_attention: true
          })
          .eq('id', transaction_id);

        return new Response(JSON.stringify({
          error: 'Failed to reverse temporary credit',
          message: 'Transaction kept in Needs Attention state',
          sub_status: 'reversal_failed'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log('No temporary credit to reverse');
      creditReversalResult = {
        reversed: false,
        message: 'No temporary credit was provided for this transaction'
      };
    }

    // Update transaction to closed_lost
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        dispute_status: 'closed_lost',
        needs_attention: false
      })
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update transaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Also update the dispute record status
    const { error: disputeUpdateError } = await supabase
      .from('disputes')
      .update({ status: 'closed_lost' })
      .eq('transaction_id', transaction_id);

    if (disputeUpdateError) {
      console.error('Error updating dispute status:', disputeUpdateError);
    }

      // Create audit log entry
      const { error: auditError } = await supabase
        .from('representment_audit_log')
        .insert({
          transaction_id,
          action: 'accept',
          performed_by: user.id,
          performed_at: new Date().toISOString(),
          merchant_document_url: representment?.representment_document_url,
          note: notes || "Bank accepted merchant's proof; customer credit reversed.",
          metadata: { credit_reversal: creditReversalResult }
        });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Representment accepted successfully',
      transaction_id,
      new_status: 'closed_lost',
      credit_reversal: creditReversalResult
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in accept-representment:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
