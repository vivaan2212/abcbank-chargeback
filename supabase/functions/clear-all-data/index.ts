import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting data deletion process...');

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get counts before deletion
    const { count: messageCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true });

    const { count: disputeCount } = await supabaseAdmin
      .from('disputes')
      .select('*', { count: 'exact', head: true });

    const { count: conversationCount } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true });

    console.log(`Found ${messageCount} messages, ${disputeCount} disputes, ${conversationCount} conversations`);

    // Delete in order: messages -> disputes -> conversations (respecting foreign keys)
    
    // 1. Delete all messages
    const { error: messagesError } = await supabaseAdmin
      .from('messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      throw messagesError;
    }
    console.log(`Deleted ${messageCount} messages`);

    // 2. Delete all disputes
    const { error: disputesError } = await supabaseAdmin
      .from('disputes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (disputesError) {
      console.error('Error deleting disputes:', disputesError);
      throw disputesError;
    }
    console.log(`Deleted ${disputeCount} disputes`);

    // 2.5. Reset all representment statuses to pending
    const { error: representmentError } = await supabaseAdmin
      .from('chargeback_representment_static')
      .update({
        representment_status: 'pending',
        will_be_represented: true,
        merchant_reason_text: 'Customer received the products as ordered. We have proof of delivery with customer signature on 2024-01-15. The customer used the service for 2 weeks before disputing. All items were delivered in perfect condition according to our courier records.'
      })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all records

    if (representmentError) {
      console.error('Error resetting representment statuses:', representmentError);
      throw representmentError;
    }
    console.log('Reset all representment statuses to pending');

    // 2.6. Reset transaction temporary credit reversal timestamps
    const { error: transactionResetError } = await supabaseAdmin
      .from('transactions')
      .update({
        temporary_credit_reversal_at: null
      })
      .not('temporary_credit_reversal_at', 'is', null);

    if (transactionResetError) {
      console.error('Error resetting transaction reversal timestamps:', transactionResetError);
      throw transactionResetError;
    }
    console.log('Reset transaction temporary credit reversal timestamps');

    // 3. Delete all conversations
    const { error: conversationsError } = await supabaseAdmin
      .from('conversations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (conversationsError) {
      console.error('Error deleting conversations:', conversationsError);
      throw conversationsError;
    }
    console.log(`Deleted ${conversationCount} conversations`);

    console.log('All data deleted successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'All dispute data deleted successfully',
        deleted: {
          messages: messageCount,
          disputes: disputeCount,
          conversations: conversationCount
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in clear-all-data function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
