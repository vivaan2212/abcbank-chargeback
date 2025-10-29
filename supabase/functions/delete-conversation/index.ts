import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

interface DeleteRequest {
  conversationId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Get idempotency key from header
    const idempotencyKey = req.headers.get('x-idempotency-key');
    if (!idempotencyKey) {
      console.error('Missing idempotency key');
      return new Response(
        JSON.stringify({ error: 'Missing X-Idempotency-Key header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { conversationId }: DeleteRequest = await req.json();
    if (!conversationId) {
      console.error('Missing conversationId');
      return new Response(
        JSON.stringify({ error: 'Missing conversationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this operation was already performed (idempotency)
    const { data: existingOp } = await supabase
      .from('delete_operations')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingOp) {
      console.log('Idempotent request - returning existing result:', {
        idempotencyKey,
        conversationId: existingOp.conversation_id,
        deletedAt: existingOp.deleted_at,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          chatId: existingOp.conversation_id,
          deletedAt: existingOp.deleted_at,
          idempotencyKey: existingOp.idempotency_key,
          fromCache: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify conversation ownership
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found or unauthorized:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found or unauthorized' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use RPC or direct client to perform transactional delete
    // First delete related disputes (which cascade to documents)
    const { error: disputesError } = await supabase
      .from('disputes')
      .delete()
      .eq('conversation_id', conversationId);

    if (disputesError) {
      console.error('Error deleting disputes:', disputesError);
      throw new Error(`Failed to delete disputes: ${disputesError.message}`);
    }

    // Delete messages
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      throw new Error(`Failed to delete messages: ${messagesError.message}`);
    }

    // Delete conversation
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (deleteError) {
      console.error('Error deleting conversation:', deleteError);
      throw new Error(`Failed to delete conversation: ${deleteError.message}`);
    }

    const deletedAt = new Date().toISOString();

    // Record the delete operation for idempotency
    const { error: recordError } = await supabase
      .from('delete_operations')
      .insert({
        idempotency_key: idempotencyKey,
        user_id: user.id,
        conversation_id: conversationId,
        deleted_at: deletedAt,
        result: { ok: true },
      });

    if (recordError) {
      console.error('Failed to record delete operation:', recordError);
      // Don't fail the request if we can't record - deletion already succeeded
    }

    const durationMs = Date.now() - startTime;
    console.log('Conversation deleted successfully:', {
      userId: user.id,
      conversationId,
      idempotencyKey,
      durationMs,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        chatId: conversationId,
        deletedAt,
        idempotencyKey,
        durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('Delete conversation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({
        error: errorMessage,
        durationMs,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
