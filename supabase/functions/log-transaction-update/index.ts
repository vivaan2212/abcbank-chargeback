import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userInput, conversationHistory, transactionContext } = await req.json();
    
    if (!userInput) {
      return new Response(
        JSON.stringify({ error: 'User input is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log('Processing update request from user:', user.id);

    // Prepare messages for AI to guide the conversation
    const messages = [
      {
        role: 'system',
        content: `You are Pace, a chargeback assistant helping to log transaction decision updates for the knowledge base.

Your role is to:
1. Ask clarifying questions to understand the update request
2. Extract key information about similar transactions and how they should be handled
3. Once you have enough information, provide a structured summary

Key information to collect:
- What type of transaction/scenario is this about?
- What was the previous decision or handling approach?
- What should change and why?
- What are the specific conditions or criteria for this update?
- Are there any amount limits, time restrictions, or other rules to consider?

Ask ONE question at a time to gather this information naturally. Keep questions conversational and easy to understand.

When you have gathered sufficient information, respond with a JSON object wrapped in triple backticks like this:
\`\`\`json
{
  "ready": true,
  "summary": "Clear summary of the update request",
  "scenario": "Description of transaction type/scenario",
  "previous_handling": "How it was handled before",
  "proposed_change": "What should change",
  "conditions": "Specific rules, limits, or criteria"
}
\`\`\`

Otherwise, just ask your next clarifying question naturally.`
      },
      ...(conversationHistory || []),
      {
        role: 'user',
        content: userInput
      }
    ];

    console.log('Calling Lovable AI to process update request...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      return new Response(
        JSON.stringify({ error: 'Failed to process update request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const response = aiData.choices[0].message.content;

    console.log('AI response:', response);

    // Check if AI has gathered enough information
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch) {
      // Extract the structured data
      const updateData = JSON.parse(jsonMatch[1]);
      
      // Log this to a pending updates table for admin review
      const { error: logError } = await supabase
        .from('chargeback_knowledge_base')
        .insert({
          title: `Pending Update: ${updateData.scenario}`,
          content: `**Summary:** ${updateData.summary}\n\n**Scenario:** ${updateData.scenario}\n\n**Previous Handling:** ${updateData.previous_handling}\n\n**Proposed Change:** ${updateData.proposed_change}\n\n**Conditions:** ${updateData.conditions}`,
          category: 'pending_update',
          keywords: ['update', 'pending', updateData.scenario.toLowerCase()]
        });

      if (logError) {
        console.error('Error logging update:', logError);
      } else {
        console.log('Update logged successfully for admin review');
      }

      return new Response(
        JSON.stringify({ 
          response: "Thank you! I've logged your update request. A bank administrator will review it and update Pace's decision-making process accordingly. Is there anything else I can help you with?",
          completed: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Still gathering information
    return new Response(
      JSON.stringify({ 
        response,
        completed: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-transaction-update:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
