import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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

    console.log(`Checking merchant representment for transaction: ${transaction_id}`);

    // Fetch transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('TRANSACTION_NOT_FOUND:', txError);
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch merchant representment
    const { data: representment, error: repError } = await supabase
      .from('merchant_representments')
      .select('*')
      .eq('transaction_id', transaction_id)
      .order('representment_created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (repError) {
      console.error('Error fetching representment:', repError);
    }

    // If no representment or has_representment is false, exit gracefully
    if (!representment || !representment.has_representment) {
      console.log('No representment found for transaction:', transaction_id);
      return new Response(JSON.stringify({ 
        message: 'No representment found',
        needs_attention: false 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update transaction record
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        dispute_status: 'representment_received',
        needs_attention: true
      })
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update transaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build dashboard payload
    const dashboardPayload = {
      transaction_id,
      status_badge: 'Needs Attention',
      representment: {
        present: true,
        reason_code: representment.representment_reason_code || 'N/A',
        reason_text: representment.representment_reason_text || 'No reason provided',
        document_url: representment.representment_document_url || null,
        created_at: representment.representment_created_at,
        source: representment.representment_source
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

    console.log('Representment detected and transaction updated:', dashboardPayload);

    return new Response(JSON.stringify({
      success: true,
      ...dashboardPayload
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in check-merchant-representment:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
