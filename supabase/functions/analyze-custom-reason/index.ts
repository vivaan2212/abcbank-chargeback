import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customReason } = await req.json();
    console.log('Analyzing custom reason:', customReason);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `You are a chargeback classification expert. Analyze the customer's dispute reason and classify it into one of these categories:
            
1. "fraud" - Fraudulent or unauthorized transactions
2. "not_received" - Goods or services not received
3. "duplicate" - Duplicate charges
4. "incorrect_amount" - Incorrect transaction amount
5. "defective" - Defective or not as described goods
6. "billing_error" - Billing errors or processing issues
7. "not_eligible" - Does not qualify for chargeback

Based on the classification, provide the required documents. Return ONLY a valid JSON object with this exact structure:
{
  "category": "fraud|not_received|duplicate|incorrect_amount|defective|billing_error|not_eligible",
  "categoryLabel": "Human-readable category name",
  "explanation": "Brief explanation of why this was classified this way",
  "documents": [
    {
      "name": "Document Name",
      "uploadTypes": "comma-separated file types like: PDF, Word, Image, Text"
    }
  ],
  "userMessage": "Message to show the customer explaining what was detected and what's needed"
}

Important: 
- ALWAYS return exactly 3 documents (except for not_eligible which should have empty documents array)
- For generic document types, provide helpful examples in the document name. Examples:
  * "Proof of purchase (e.g., invoice, receipt, order confirmation)"
  * "Communication with merchant (e.g., emails, chat transcripts, support tickets)"
  * "Bank or credit card statement showing the charge"
- For product-related issues (defective, damaged, wrong size, wrong color, not as described), ALWAYS include "Photo of the product showing the issue" with uploadTypes "Image"
- Be specific and helpful with document names to guide the customer
- For not_eligible cases, return an empty documents array
- Be precise and only classify as not_eligible if it truly doesn't qualify
- Always return valid JSON, nothing else`
          },
          {
            role: 'user',
            content: `Analyze this chargeback reason: "${customReason}"`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_chargeback",
              description: "Classify a chargeback reason and determine required documents",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["fraud", "not_received", "duplicate", "incorrect_amount", "defective", "billing_error", "not_eligible"]
                  },
                  categoryLabel: { type: "string" },
                  explanation: { type: "string" },
                  documents: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        uploadTypes: { type: "string" }
                      },
                      required: ["name", "uploadTypes"],
                      additionalProperties: false
                    }
                  },
                  userMessage: { type: "string" }
                },
                required: ["category", "categoryLabel", "explanation", "documents", "userMessage"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_chargeback" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('AI Response:', JSON.stringify(data, null, 2));

    // Extract the tool call result
    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      throw new Error('No tool call in AI response');
    }

    const classification = JSON.parse(toolCall.function.arguments);
    console.log('Classification result:', classification);

    return new Response(
      JSON.stringify(classification),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-custom-reason:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Failed to analyze custom reason'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
