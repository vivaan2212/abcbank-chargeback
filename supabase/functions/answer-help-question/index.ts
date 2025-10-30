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
    const { question, conversationHistory } = await req.json();
    
    if (!question) {
      return new Response(
        JSON.stringify({ error: 'Question is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Searching knowledge base for:', question);

    // Search knowledge base for relevant information
    // Using keyword matching and content search
    const { data: knowledgeEntries, error: kbError } = await supabase
      .from('chargeback_knowledge_base')
      .select('*')
      .or(`content.ilike.%${question}%,title.ilike.%${question}%`)
      .limit(5);

    if (kbError) {
      console.error('Error querying knowledge base:', kbError);
    }

    // Build context from knowledge base
    let knowledgeContext = '';
    if (knowledgeEntries && knowledgeEntries.length > 0) {
      knowledgeContext = knowledgeEntries
        .map(entry => `**${entry.title}**\n${entry.content}`)
        .join('\n\n');
      console.log(`Found ${knowledgeEntries.length} relevant knowledge base entries`);
    } else {
      console.log('No relevant knowledge base entries found');
    }

    // Prepare messages for AI
    const messages = [
      {
        role: 'system',
        content: `You are Pace, a helpful chargeback assistant. Answer customer questions about the chargeback process clearly and concisely. 

Use the following knowledge base information to answer questions accurately:

${knowledgeContext || 'No specific knowledge base information available for this query.'}

Guidelines:
- Be friendly and supportive
- Keep answers concise (2-3 sentences when possible)
- If the knowledge base doesn't contain the answer, provide general guidance and suggest they contact support
- Use simple language, avoid jargon
- If asked about specific case details, remind them to check their case status in the dashboard`
      },
      ...(conversationHistory || []),
      {
        role: 'user',
        content: question
      }
    ];

    console.log('Calling Lovable AI...');

    // Call Lovable AI
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
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service unavailable. Please try again later.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to get AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;

    console.log('Successfully generated answer');

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in answer-help-question:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
