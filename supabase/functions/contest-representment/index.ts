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
      return new Response(JSON.stringify({ error: 'Only bank admins can contest representments' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { transaction_id, additional_documents, notes } = await req.json();

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'transaction_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Contesting representment for transaction: ${transaction_id}`);

    // Fetch transaction
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

    // TODO: Call Visa/Mastercard API to contest representment
    // This would involve building dispute action payload with:
    // - Original dispute data
    // - Merchant's representment (as counter-evidence)
    // - Additional documents from bank
    console.log('TODO: Call card network API to contest representment');

    // Simulate API success for now
    const apiSuccess = true;

    if (apiSuccess) {
      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          dispute_status: 'representment_contested',
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

      // Create audit log entry
      const { error: auditError } = await supabase
        .from('representment_audit_log')
        .insert({
          transaction_id,
          action: 'contest_representment',
          performed_by: user.id,
          performed_at: new Date().toISOString(),
          reason: 'Bank chose to contest merchant representment',
          note: notes || 'Representment contested by bank admin',
          metadata: { additional_documents }
        });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Representment contested successfully',
        transaction_id,
        new_status: 'representment_contested'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // API call failed, keep needs_attention = true
      return new Response(JSON.stringify({
        error: 'Failed to contest representment with card network',
        message: 'Please try again later'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in contest-representment:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
