import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

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

    console.log('Current content length:', currentContent.content.length);
    console.log('Update request:', new_content);

    // Use AI to intelligently merge the update into existing content
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert knowledge base editor. Your task is to intelligently update a knowledge base document based on user requests. 

CRITICAL RULES:
1. PRESERVE the existing content structure and format (HTML with proper heading tags)
2. When the user requests an update, interpret their intent and merge it into the appropriate section
3. Reword updates as clear instructions, rules, or procedural steps
4. If the update adds a new rule or limit, integrate it naturally into the relevant section
5. If the update modifies existing information, update that specific part while keeping the rest intact
6. Maintain consistent formatting: use <h1>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong> tags
7. Keep the tone professional and clear
8. Do NOT remove existing content unless the update explicitly replaces it
9. If the update is about chargebacks limits or rules, add it to the appropriate "Agent Processing Scenarios" or "Agent Capabilities" section

Return ONLY the complete updated HTML content, no explanation.`
          },
          {
            role: 'user',
            content: `Current Knowledge Base Content:
${currentContent.content}

User Update Request:
${new_content}

Please update the knowledge base by intelligently integrating this request into the existing content. Reword it as professional instructions or rule sets, and place it in the most appropriate section.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', aiResponse.status, await aiResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to process update with AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const mergedContent = aiData.choices[0].message.content.trim();

    console.log('AI merged content length:', mergedContent.length);

    // Update the knowledge base content with AI-enhanced version
    const { data: updatedContent, error: updateError } = await supabase
      .from('knowledge_base_content')
      .update({ 
        content: mergedContent,
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
        new_content: mergedContent
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
