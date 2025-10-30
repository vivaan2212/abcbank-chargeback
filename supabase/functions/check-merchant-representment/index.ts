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

    // Authenticate user
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

    const { transaction_id } = await req.json();

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'transaction_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CHECK-REPRESENTMENT] Checking merchant response for transaction: ${transaction_id}`);

    // Step 1: Fetch transaction and verify chargeback was filed
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('[CHECK-REPRESENTMENT] Transaction not found:', txError);
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify chargeback has been filed
    if (transaction.dispute_status !== 'chargeback_filed') {
      console.log(`[CHECK-REPRESENTMENT] Transaction ${transaction_id} has not reached chargeback_filed status. Current: ${transaction.dispute_status}`);
      return new Response(JSON.stringify({ 
        message: 'Chargeback not yet filed for this transaction',
        current_status: transaction.dispute_status
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Check static merchant response config
    const { data: config, error: configError } = await supabase
      .from('merchant_response_config')
      .select('*')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (configError) {
      console.error('[CHECK-REPRESENTMENT] Error fetching config:', configError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!config) {
      console.warn('[CHECK-REPRESENTMENT] No merchant response config found for transaction:', transaction_id);
      return new Response(JSON.stringify({ 
        message: 'No merchant response configuration found',
        needs_attention: false 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CHECK-REPRESENTMENT] Config found - will_representment: ${config.will_representment}`);

    // Step 3A: Merchant ACCEPTS chargeback (will_representment = false)
    if (!config.will_representment) {
      console.log('[CHECK-REPRESENTMENT] Merchant accepts chargeback - processing acceptance');

      // Update transaction status to closed_won
      const { error: txUpdateError } = await supabase
        .from('transactions')
        .update({
          dispute_status: 'closed_won',
          needs_attention: false
        })
        .eq('id', transaction_id);

      if (txUpdateError) {
        console.error('[CHECK-REPRESENTMENT] Failed to update transaction:', txUpdateError);
        return new Response(JSON.stringify({ error: 'Failed to update transaction' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update dispute status
      const { error: disputeUpdateError } = await supabase
        .from('disputes')
        .update({ status: 'closed_won' })
        .eq('transaction_id', transaction_id);

      if (disputeUpdateError) {
        console.error('[CHECK-REPRESENTMENT] Failed to update dispute:', disputeUpdateError);
      }

      // Create audit log entry
      const { error: auditError } = await supabase
        .from('representment_audit_log')
        .insert({
          transaction_id,
          action: 'merchant_accepted_chargeback',
          reason: 'Merchant did not contest the chargeback',
          performed_by: null, // System action
          metadata: { config_id: config.id }
        });

      if (auditError) {
        console.error('[CHECK-REPRESENTMENT] Failed to create audit log:', auditError);
      }

      console.log('[CHECK-REPRESENTMENT] Merchant acceptance processed successfully');

      return new Response(JSON.stringify({
        success: true,
        merchant_accepted: true,
        transaction_id,
        message: 'Merchant accepted the chargeback. Customer retains the temporary credit.',
        needs_attention: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3B: Merchant REPRESENTMENTS (will_representment = true)
    console.log('[CHECK-REPRESENTMENT] Merchant will representment - creating representment record');

    // Create/update merchant_representments record
    const { data: existingRep, error: checkRepError } = await supabase
      .from('merchant_representments')
      .select('id')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (checkRepError) {
      console.error('[CHECK-REPRESENTMENT] Error checking existing representment:', checkRepError);
    }

    let representmentRecord;

    if (existingRep) {
      // Update existing
      const { data: updatedRep, error: updateRepError } = await supabase
        .from('merchant_representments')
        .update({
          has_representment: true,
          representment_reason_code: config.response_reason_code,
          representment_reason_text: config.response_reason_text,
          representment_document_url: config.response_document_url,
          representment_source: 'merchant_portal',
          representment_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRep.id)
        .select()
        .single();

      if (updateRepError) {
        console.error('[CHECK-REPRESENTMENT] Failed to update representment:', updateRepError);
        return new Response(JSON.stringify({ error: 'Failed to update representment' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      representmentRecord = updatedRep;
    } else {
      // Insert new
      const { data: newRep, error: insertRepError } = await supabase
        .from('merchant_representments')
        .insert({
          transaction_id,
          has_representment: true,
          representment_reason_code: config.response_reason_code,
          representment_reason_text: config.response_reason_text,
          representment_document_url: config.response_document_url,
          representment_source: 'merchant_portal',
          representment_created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertRepError) {
        console.error('[CHECK-REPRESENTMENT] Failed to create representment:', insertRepError);
        return new Response(JSON.stringify({ error: 'Failed to create representment' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      representmentRecord = newRep;
    }

    // Update transaction to representment_received
    const { error: txRepUpdateError } = await supabase
      .from('transactions')
      .update({
        dispute_status: 'representment_received',
        needs_attention: true
      })
      .eq('id', transaction_id);

    if (txRepUpdateError) {
      console.error('[CHECK-REPRESENTMENT] Failed to update transaction status:', txRepUpdateError);
      return new Response(JSON.stringify({ error: 'Failed to update transaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update dispute status
    const { error: disputeRepUpdateError } = await supabase
      .from('disputes')
      .update({ status: 'representment_received' })
      .eq('transaction_id', transaction_id);

    if (disputeRepUpdateError) {
      console.error('[CHECK-REPRESENTMENT] Failed to update dispute:', disputeRepUpdateError);
    }

    console.log('[CHECK-REPRESENTMENT] Representment created successfully');

    // Build dashboard payload
    const dashboardPayload = {
      transaction_id,
      status_badge: 'Needs Attention',
      representment: {
        present: true,
        reason_code: config.response_reason_code || 'N/A',
        reason_text: config.response_reason_text || 'No reason provided',
        document_url: config.response_document_url || null,
        created_at: representmentRecord.representment_created_at,
        source: 'merchant_portal'
      },
      actions: {
        can_contest: true,
        can_accept: true
      },
      temporary_credit: {
        provided: transaction.temporary_credit_provided,
        amount: transaction.temporary_credit_amount,
        currency: transaction.temporary_credit_currency
      }
    };

    return new Response(JSON.stringify({
      success: true,
      ...dashboardPayload
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CHECK-REPRESENTMENT] Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
