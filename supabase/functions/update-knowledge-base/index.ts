import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { section_key, new_content } = await req.json();
    
    if (!section_key || !new_content) {
      return new Response(
        JSON.stringify({ error: 'section_key and new_content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User requesting update:', user.id);

    // Check if user has bank_admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'bank_admin')
      .single();

    if (roleError || !userRole) {
      console.log('User does not have bank_admin role');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'You do not have permission to update the knowledge base. Only bank administrators can make updates.' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current content
    const { data: currentContent, error: fetchError } = await supabase
      .from('knowledge_base_content')
      .select('*')
      .eq('section_key', section_key)
      .single();

    if (fetchError) {
      console.error('Error fetching current content:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch current content' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the knowledge base content
    const { data: updatedContent, error: updateError } = await supabase
      .from('knowledge_base_content')
      .update({ 
        content: new_content,
        updated_at: new Date().toISOString()
      })
      .eq('section_key', section_key)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating knowledge base:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update knowledge base' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the update
    const { error: logError } = await supabase
      .from('knowledge_base_updates')
      .insert({
        updated_by: user.id,
        section_key: section_key,
        previous_content: currentContent.content,
        new_content: new_content
      });

    if (logError) {
      console.error('Error logging update:', logError);
      // Don't fail the request if logging fails
    }

    console.log('Knowledge base updated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated_at: updatedContent.updated_at,
        message: 'Knowledge base updated successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-knowledge-base:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
