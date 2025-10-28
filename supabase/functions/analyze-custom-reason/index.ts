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
    const { customReason, orderDetails, merchantName } = await req.json();
    console.log('Analyzing custom reason:', customReason);
    console.log('Order details:', orderDetails);
    console.log('Merchant name:', merchantName);

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
            content: `You are a chargeback classification expert. The customer is filing a chargeback and has provided:

MERCHANT NAME: ${merchantName || 'Unknown'}
ORDER DETAILS (provided earlier): ${orderDetails || 'Not provided'}
CHARGEBACK REASON (just provided): ${customReason}

Your task is to:
1. Compare the ORDER DETAILS with the CHARGEBACK REASON to check if they match
2. If they don't match (e.g., customer said "damaged TV" but reason is "never received"), return category "mismatch"
3. If the reason is not eligible for chargeback, return category "not_eligible"
4. If they match and are eligible, classify into the appropriate chargeback category

Available categories:
            
1. "fraud" - Fraudulent or unauthorized transactions
2. "not_received" - Goods or services not received
3. "duplicate" - Duplicate charges
4. "incorrect_amount" - Incorrect transaction amount
5. "defective" - Defective or not as described goods
6. "billing_error" - Billing errors or processing issues
7. "mismatch" - Order details don't match the chargeback reason
8. "not_eligible" - Does not qualify for chargeback

CRITICAL REQUIREMENT: You MUST return exactly 3 documents for ALL categories (except not_eligible and mismatch which have 0 documents).

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

For "not_eligible" category:
{
  "category": "not_eligible",
  "categoryLabel": "Not eligible for chargeback",
  "explanation": "Reason does not meet chargeback eligibility criteria",
  "documents": [],
  "userMessage": "We cannot process a chargeback with the reason \"[reason]\". This does not meet our eligibility criteria for chargebacks."
}

For "mismatch" category (when order details don't match the reason):
{
  "category": "mismatch",
  "categoryLabel": "Details don't match",
  "explanation": "The chargeback reason doesn't match the order details provided earlier",
  "documents": [],
  "userMessage": "It seems that the information you provided earlier doesn't match with the chargeback reason you've selected. Here's what we found:\n- Merchant: [merchantName]\n- Description: [orderDetails]\n\nSince the details don't match, we cannot proceed with the chargeback for this reason."
}

MANDATORY RULES:
- FIRST, check if order details match the chargeback reason. If not, return "mismatch"
- ALWAYS return EXACTLY 3 documents (except not_eligible or mismatch = 0 documents)
- For product issues (defective, damaged, wrong item, etc.), document #1 MUST be "Photo of the product showing the issue" with uploadTypes "Image"
- For generic documents, include helpful examples in parentheses (e.g., "Proof of purchase (e.g., invoice, receipt, order confirmation)")
- Never return fewer than 3 documents unless category is not_eligible or mismatch
- For not_eligible or mismatch: NEVER ask for more details or information. Simply state the reason is not eligible/mismatched and STOP.
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
                    enum: ["fraud", "not_received", "duplicate", "incorrect_amount", "defective", "billing_error", "mismatch", "not_eligible"]
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
    console.log('Classification result (raw):', classification);

    // Enforce EXACTLY 3 documents (except not_eligible = 0) using deterministic templates
    type Doc = { name: string; uploadTypes: string };

    const TEMPLATES: Record<string, Doc[]> = {
      defective: [
        { name: "Photo of the product showing the issue", uploadTypes: "Image" },
        { name: "Proof of purchase (e.g., invoice, receipt, order confirmation)", uploadTypes: "PDF, Image, Word" },
        { name: "Communication with merchant (e.g., emails, chat transcripts, support tickets)", uploadTypes: "PDF, Image, Word, Text" },
      ],
      fraud: [
        { name: "Police report or fraud affidavit", uploadTypes: "PDF, Image, Word" },
        { name: "Bank or credit card statement showing the charge", uploadTypes: "PDF, Image" },
        { name: "Any communication with the merchant about this charge", uploadTypes: "PDF, Image, Word, Text" },
      ],
      not_received: [
        { name: "Proof of purchase (e.g., invoice, receipt, order confirmation)", uploadTypes: "PDF, Image, Word" },
        { name: "Communication with merchant (e.g., emails, chat transcripts, support tickets)", uploadTypes: "PDF, Image, Word, Text" },
        { name: "Bank or credit card statement showing the charge", uploadTypes: "PDF, Image" },
      ],
      duplicate: [
        { name: "Bank or credit card statement highlighting duplicate charges", uploadTypes: "PDF, Image" },
        { name: "Proof of purchase or receipt", uploadTypes: "PDF, Image, Word" },
        { name: "Communication with merchant requesting a refund or correction", uploadTypes: "PDF, Image, Word, Text" },
      ],
      incorrect_amount: [
        { name: "Proof of purchase showing expected amount", uploadTypes: "PDF, Image, Word" },
        { name: "Bank or credit card statement showing charged amount", uploadTypes: "PDF, Image" },
        { name: "Communication with merchant about the discrepancy", uploadTypes: "PDF, Image, Word, Text" },
      ],
      billing_error: [
        { name: "Invoice or receipt showing correct details", uploadTypes: "PDF, Image, Word" },
        { name: "Bank or credit card statement showing the error", uploadTypes: "PDF, Image" },
        { name: "Communication with merchant/support about the error", uploadTypes: "PDF, Image, Word, Text" },
      ],
    };

    function enforceThreeDocs(category: string, docs: Doc[] = []): Doc[] {
      if (category === 'not_eligible' || category === 'mismatch') return [];
      const template = TEMPLATES[category as keyof typeof TEMPLATES] ?? TEMPLATES.billing_error;

      // Normalize document name by removing examples in parentheses and trimming
      const normalizeDocName = (name: string): string => {
        return name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
      };

      // Start with an ordered result; ensure 'defective' first doc rule
      const result: Doc[] = [];
      const seenNormalized = new Set<string>();
      
      const pushIfMissing = (d: Doc) => {
        const normalized = normalizeDocName(d.name);
        if (!seenNormalized.has(normalized)) {
          seenNormalized.add(normalized);
          result.push(d);
        }
      };

      if (category === 'defective') pushIfMissing(template[0]);

      // Add provided docs
      for (const d of docs) pushIfMissing({ name: d.name, uploadTypes: d.uploadTypes });
      // Fill from template in order
      for (const d of template) pushIfMissing(d);

      return result.slice(0, 3);
    }

    // Apply enforcement and normalize user message
    classification.documents = enforceThreeDocs(classification.category, classification.documents);

    // Handle mismatch category
    if (classification.category === 'mismatch') {
      classification.documents = [];
      if (!classification.userMessage) {
        classification.userMessage = `It seems that the information you provided earlier doesn't match with the chargeback reason you've selected.\n\nHere's what we found:\n- Merchant: ${merchantName || 'Unknown'}\n- Description: ${orderDetails || 'Not provided'}\n\nSince the details don't match, we cannot proceed with the chargeback for this reason.`;
      }
    }

    if (classification.category === 'not_eligible') {
      classification.documents = [];
      // Ensure the message never asks for more details - just state it's not eligible
      if (!classification.userMessage || classification.userMessage.toLowerCase().includes('provide more')) {
        classification.userMessage = `We cannot process a chargeback with the reason "${customReason}". This does not meet our eligibility criteria for chargebacks.`;
      }
    } else {
      if (!classification.userMessage || !/\b3\b/.test(classification.userMessage)) {
        classification.userMessage = 'We understand your situation. Please upload 3 documents to help us process your chargeback.';
      }
    }

    console.log('Classification result (post-processed):', classification);

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
