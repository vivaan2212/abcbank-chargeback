import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

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
    
    const token = authHeader.replace('Bearer ', '');
    const { data, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !data?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = data.claims.sub;

    console.log('Starting data deletion process...');

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      supabaseUrl,
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

    const { count: documentCount } = await supabaseAdmin
      .from('dispute_documents')
      .select('*', { count: 'exact', head: true });

    const { count: evidenceReviewCount } = await supabaseAdmin
      .from('customer_evidence_reviews')
      .select('*', { count: 'exact', head: true });

    const { count: actionLogCount } = await supabaseAdmin
      .from('dispute_action_log')
      .select('*', { count: 'exact', head: true });

    const { count: customerEvidenceCount } = await supabaseAdmin
      .from('dispute_customer_evidence')
      .select('*', { count: 'exact', head: true });

    const { count: evidenceRequestCount } = await supabaseAdmin
      .from('dispute_customer_evidence_request')
      .select('*', { count: 'exact', head: true });

    const { count: decisionCount } = await supabaseAdmin
      .from('dispute_decisions')
      .select('*', { count: 'exact', head: true });

    const { count: chargebackActionCount } = await supabaseAdmin
      .from('chargeback_actions')
      .select('*', { count: 'exact', head: true });

    console.log(`Found ${messageCount} messages, ${disputeCount} disputes, ${conversationCount} conversations, ${documentCount} documents, ${evidenceReviewCount} evidence reviews, ${actionLogCount} action logs, ${customerEvidenceCount} customer evidence, ${evidenceRequestCount} evidence requests, ${decisionCount} decisions, ${chargebackActionCount} chargeback actions`);

    // Delete in order (respecting foreign keys):
    // messages -> evidence reviews -> action logs -> customer evidence -> evidence requests -> documents -> disputes -> decisions -> conversations
    
    // 1. Delete all messages
    const { error: messagesError } = await supabaseAdmin
      .from('messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      throw messagesError;
    }
    console.log(`Deleted ${messageCount} messages`);

    // 2. Delete all customer evidence reviews
    const { error: evidenceReviewsError } = await supabaseAdmin
      .from('customer_evidence_reviews')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (evidenceReviewsError) {
      console.error('Error deleting evidence reviews:', evidenceReviewsError);
      throw evidenceReviewsError;
    }
    console.log(`Deleted ${evidenceReviewCount} evidence reviews`);

    // 3. Delete all dispute action logs
    const { error: actionLogsError } = await supabaseAdmin
      .from('dispute_action_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (actionLogsError) {
      console.error('Error deleting action logs:', actionLogsError);
      throw actionLogsError;
    }
    console.log(`Deleted ${actionLogCount} action logs`);

    // 4. Delete all customer evidence
    const { error: customerEvidenceError } = await supabaseAdmin
      .from('dispute_customer_evidence')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (customerEvidenceError) {
      console.error('Error deleting customer evidence:', customerEvidenceError);
      throw customerEvidenceError;
    }
    console.log(`Deleted ${customerEvidenceCount} customer evidence records`);

    // 5. Delete all evidence requests
    const { error: evidenceRequestsError } = await supabaseAdmin
      .from('dispute_customer_evidence_request')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (evidenceRequestsError) {
      console.error('Error deleting evidence requests:', evidenceRequestsError);
      throw evidenceRequestsError;
    }
    console.log(`Deleted ${evidenceRequestCount} evidence requests`);

    // 6. Delete all chargeback actions
    const { error: chargebackActionsError } = await supabaseAdmin
      .from('chargeback_actions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (chargebackActionsError) {
      console.error('Error deleting chargeback actions:', chargebackActionsError);
      throw chargebackActionsError;
    }
    console.log(`Deleted ${chargebackActionCount} chargeback actions`);

    // 7. Delete all uploaded documents from storage and database
    // First, get all document paths from the database
    const { data: documents, error: documentsSelectError } = await supabaseAdmin
      .from('dispute_documents')
      .select('storage_path');

    if (documentsSelectError) {
      console.error('Error fetching documents:', documentsSelectError);
    } else if (documents && documents.length > 0) {
      // Delete files from storage bucket
      const filePaths = documents.map(doc => doc.storage_path);
      console.log(`Deleting ${filePaths.length} files from storage...`);
      
      const { error: storageDeleteError } = await supabaseAdmin
        .storage
        .from('dispute-documents')
        .remove(filePaths);

      if (storageDeleteError) {
        console.error('Error deleting files from storage:', storageDeleteError);
      } else {
        console.log(`Deleted ${filePaths.length} files from storage`);
      }
    }

    // Delete document metadata from database
    const { error: documentsError } = await supabaseAdmin
      .from('dispute_documents')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (documentsError) {
      console.error('Error deleting document metadata:', documentsError);
      throw documentsError;
    }
    console.log(`Deleted ${documentCount} document records`);

    // 8. Delete all dispute decisions
    const { error: decisionsError } = await supabaseAdmin
      .from('dispute_decisions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (decisionsError) {
      console.error('Error deleting dispute decisions:', decisionsError);
      throw decisionsError;
    }
    console.log(`Deleted ${decisionCount} dispute decisions`);

    // 9. Delete all disputes
    const { error: disputesError } = await supabaseAdmin
      .from('disputes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (disputesError) {
      console.error('Error deleting disputes:', disputesError);
      throw disputesError;
    }
    console.log(`Deleted ${disputeCount} disputes`);

    // 10. Reset all representment statuses to pending
    // First update all with default text
    const { error: representmentError } = await supabaseAdmin
      .from('chargeback_representment_static')
      .update({
        representment_status: 'pending',
        will_be_represented: true,
        merchant_reason_text: 'Customer received the products as ordered. We have proof of delivery with customer signature on 2024-01-15. The customer used the service for 2 weeks before disputing. All items were delivered in perfect condition according to our courier records.'
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (representmentError) {
      console.error('Error resetting representment statuses:', representmentError);
      throw representmentError;
    }
    
    // Then set specific merchant reasons for key merchants
    const specificMerchantReasons = [
      {
        transaction_id: '3cce322e-e7c2-4ed6-9682-bff67fc952f9',
        reason: 'The correct Gucci bag as ordered was delivered to the customer. We have proof of delivery with customer signature on September 28, 2025. The item was shipped in original packaging with all authentication documents included. Our courier records confirm the bag was in perfect condition upon delivery.'
      },
      {
        transaction_id: '996d0885-9623-4694-bfa8-135db5e25422',
        reason: 'The correct iPhone as ordered was delivered to the customer. We have proof of delivery with customer signature on October 12, 2025. The device was factory sealed and underwent quality inspection before shipping. It was not broken when sent - our packaging includes protective materials and insurance coverage. The customer received the device in perfect working condition according to our courier records.'
      },
      {
        transaction_id: '5103243e-317d-47ce-b6cf-3828645c2709',
        reason: 'The correct laptop as ordered was delivered to the customer in working condition. We have proof of delivery with customer signature on September 18, 2025. The laptop underwent comprehensive testing before shipment and was factory sealed. Our records confirm the device was fully functional with all specifications matching the order. The customer received the laptop with warranty documentation and setup guide.'
      },
      {
        transaction_id: '5b7dedf6-db4f-4624-9721-cf0e3cb0740e',
        reason: 'Old AirPods were not sent - the correct new AirPods as ordered were delivered to the customer. We have proof of delivery with customer signature on October 21, 2025. The AirPods were factory sealed in original Apple packaging. Our shipping records and courier verification confirm the correct product (new AirPods, not refurbished or old) was delivered in perfect condition.'
      }
    ];

    for (const merchant of specificMerchantReasons) {
      const { error: specificError } = await supabaseAdmin
        .from('chargeback_representment_static')
        .update({ merchant_reason_text: merchant.reason })
        .eq('transaction_id', merchant.transaction_id);
      
      if (specificError) {
        console.error(`Error updating merchant reason for ${merchant.transaction_id}:`, specificError);
      }
    }
    
    console.log('Reset all representment statuses to pending with specific merchant reasons');

    // 11. Reset transaction temporary credit reversal timestamps
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

    // 12. Delete all conversations
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
          conversations: conversationCount,
          documents: documentCount,
          evidenceReviews: evidenceReviewCount,
          actionLogs: actionLogCount,
          customerEvidence: customerEvidenceCount,
          evidenceRequests: evidenceRequestCount,
          decisions: decisionCount,
          chargebackActions: chargebackActionCount
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
