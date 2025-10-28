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

CRITICAL REQUIREMENT: You MUST return exactly 3 documents for ALL categories (except not_eligible which has 0 documents).

Example responses:

For "defective" category:
{
  "category": "defective",
  "categoryLabel": "Defective or not as described goods",
  "explanation": "Customer received damaged/defective product",
  "documents": [
    {"name": "Photo of the product showing the issue", "uploadTypes": "Image"},
    {"name": "Proof of purchase (e.g., invoice, receipt, order confirmation)", "uploadTypes": "PDF, Image, Word"},
    {"name": "Communication with merchant (e.g., emails, chat transcripts, support tickets)", "uploadTypes": "PDF, Image, Word, Text"}
  ],
  "userMessage": "We understand you received a defective product. Please upload 3 documents to help us process your chargeback."
}

For "fraud" category:
{
  "category": "fraud",
  "categoryLabel": "Fraudulent or unauthorized transaction",
  "explanation": "Customer claims unauthorized charge",
  "documents": [
    {"name": "Police report or fraud affidavit", "uploadTypes": "PDF, Image, Word"},
    {"name": "Bank or credit card statement showing the charge", "uploadTypes": "PDF, Image"},
    {"name": "Any communication with the merchant about this charge", "uploadTypes": "PDF, Image, Word, Text"}
  ],
  "userMessage": "We understand this was an unauthorized charge. Please upload 3 documents to help us process your chargeback."
}

For "not_received" category:
{
  "category": "not_received",
  "categoryLabel": "Goods or services not received",
  "explanation": "Customer didn't receive what they paid for",
  "documents": [
    {"name": "Proof of purchase (e.g., invoice, receipt, order confirmation)", "uploadTypes": "PDF, Image, Word"},
    {"name": "Communication with merchant (e.g., emails, chat transcripts, support tickets)", "uploadTypes": "PDF, Image, Word, Text"},
    {"name": "Bank or credit card statement showing the charge", "uploadTypes": "PDF, Image"}
  ],
  "userMessage": "We understand you didn't receive your order. Please upload 3 documents to help us process your chargeback."
}

MANDATORY RULES:
- ALWAYS return EXACTLY 3 documents (except not_eligible = 0 documents)
- For product issues (defective, damaged, wrong item, etc.), document #1 MUST be "Photo of the product showing the issue" with uploadTypes "Image"
- For generic documents, include helpful examples in parentheses (e.g., "Proof of purchase (e.g., invoice, receipt, order confirmation)")
- Never return fewer than 3 documents unless category is not_eligible
- Be specific and actionable with document names`
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
