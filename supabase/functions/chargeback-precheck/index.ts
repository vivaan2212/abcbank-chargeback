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
    const { step, answer1, answer2, answer3, merchantName, transactionAmount, transactionDate } = await req.json();
    console.log('Chargeback precheck request:', { step, merchantName, transactionAmount });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    let systemPrompt = '';
    let userPrompt = '';
    let tools: any[] = [];

    if (step === 'generate_q2') {
      // Step 1: Generate Q2 based on answer1
      systemPrompt = `You are a chargeback specialist helping determine if a customer's transaction issue qualifies for a chargeback.

The customer has selected a transaction:
- Merchant: ${merchantName}
- Amount: ${transactionAmount}
- Date: ${transactionDate}

They just answered Question 1: "Could you please tell us what this transaction was about and what went wrong?"

Their answer: "${answer1}"

CRITICAL VALIDATION: First, check if the customer mentioned a different merchant name in their answer.
- If they mention a merchant name that doesn't match "${merchantName}", set merchant_mismatch to true
- If merchant_mismatch is true, ask: "I see this transaction is with ${merchantName}. Are you referring to a different transaction, or did you mean ${merchantName}?"
- Only proceed with normal follow-up questions if merchant names match or no merchant was mentioned

Your task is to generate a second follow-up question that:
1. Validates merchant name consistency first (highest priority)
2. Digs deeper into the specific issue they mentioned
3. Helps determine if this is a legitimate chargeback situation
4. Asks about specific details like delivery dates, merchant communication attempts, or authorization

Guidelines for generating Q2:
- If they mention a different merchant name → ask for clarification about which transaction they're referring to
- If they mention "didn't receive" → ask about delivery date or updates from merchant
- If they mention "charged twice/duplicate" → ask if both were for same order or separate
- If they mention "wrong amount" → ask what amount they expected
- If they mention "unauthorized" → ask about card access or OTP confirmation
- If they mention "refund" → ask when merchant promised the refund
- If unclear/vague → ask what they were expecting from the transaction

The question should be conversational and always reference the correct merchant name from the transaction.`;

      userPrompt = `Generate the second follow-up question based on the customer's first answer.`;

      tools = [
        {
          type: "function",
          function: {
            name: "generate_question",
            description: "Generate a contextual follow-up question",
            parameters: {
              type: "object",
              properties: {
                question: { 
                  type: "string",
                  description: "The follow-up question to ask the customer"
                },
                detected_issue: {
                  type: "string",
                  enum: ["merchant_mismatch", "non_delivery", "duplicate_charge", "wrong_amount", "unauthorized", "refund_not_received", "defective_product", "unclear"],
                  description: "The type of issue detected from their answer"
                },
                merchant_mismatch: {
                  type: "boolean",
                  description: "True if customer mentioned a different merchant name than the transaction merchant"
                }
              },
              required: ["question", "detected_issue", "merchant_mismatch"],
              additionalProperties: false
            }
          }
        }
      ];
    } else if (step === 'generate_q3') {
      // Step 2: Generate Q3 based on answer1 and answer2
      systemPrompt = `You are a chargeback specialist helping determine if a customer's transaction issue qualifies for a chargeback.

The customer has selected a transaction:
- Merchant: ${merchantName}
- Amount: ${transactionAmount}
- Date: ${transactionDate}

Previous answers:
Question 1: "Could you please tell us what this transaction was about and what went wrong?"
Answer 1: "${answer1}"

Question 2: [Dynamic follow-up]
Answer 2: "${answer2}"

CRITICAL VALIDATION: Check if the customer mentioned a different merchant name in any of their answers.
- If they mention a merchant that doesn't match "${merchantName}", set merchant_mismatch to true
- If merchant_mismatch is true, ask: "I notice you mentioned [other merchant]. This transaction is with ${merchantName}. Are you referring to a different transaction?"
- Only ask normal follow-up questions if merchant names are consistent

Your task is to generate the third and final question that:
1. Validates merchant name consistency first (highest priority)
2. Helps determine if they've taken reasonable steps to resolve with the merchant
3. Clarifies timing and urgency of the issue
4. Confirms key facts needed to assess chargeback eligibility

The question should reference their previous answers, use the correct merchant name, and be conversational.`;

      userPrompt = `Generate the third follow-up question based on both previous answers.`;

      tools = [
        {
          type: "function",
          function: {
            name: "generate_question",
            description: "Generate a contextual follow-up question",
            parameters: {
              type: "object",
              properties: {
                question: { 
                  type: "string",
                  description: "The final follow-up question to ask the customer"
                },
                merchant_mismatch: {
                  type: "boolean",
                  description: "True if customer mentioned a different merchant name than the transaction merchant"
                }
              },
              required: ["question", "merchant_mismatch"],
              additionalProperties: false
            }
          }
        }
      ];
    } else if (step === 'evaluate') {
      // Step 3: Evaluate all 3 answers and determine chargeback eligibility
      // answer3 is already destructured from req.json() at the top
      
      systemPrompt = `You are a chargeback specialist making the final determination on whether a customer's situation qualifies for a chargeback.

The customer has selected a transaction:
- Merchant: ${merchantName}
- Amount: ${transactionAmount}
- Date: ${transactionDate}

Their responses to our 3 questions:

Question 1: "Could you please tell us what this transaction was about and what went wrong?"
Answer 1: "${answer1}"

Question 2: [Dynamic follow-up]
Answer 2: "${answer2}"

Question 3: [Dynamic follow-up]
Answer 3: "${answer3}"

Analyze all three answers together and determine:
1. Is this a legitimate chargeback situation?
2. What is the specific chargeback category?
3. What 2 documents should the customer upload?

Set chargeback_possible = TRUE when:
- Transaction appears unauthorized by the customer
- Customer did not receive goods/services after promised delivery
- Merchant promised refund but didn't deliver it
- Same transaction was charged twice (duplicate)
- Customer was charged incorrect amount and merchant hasn't corrected it
- Product received was defective/not as described

Set chargeback_possible = FALSE when:
- Customer admits receiving goods/service as expected with no issues
- Merchant has already refunded or replacement is in process
- Customer hasn't waited sufficient time for delivery/refund window
- Customer misunderstood an authorized or recurring payment
- Customer cannot describe a specific problem related to payment
- Customer contacted the merchant AFTER the return/refund policy period had expired
- Customer attempted to return/refund AFTER merchant's stated return deadline passed
- Merchant cited expired return policy and customer admits contacting them late
- Customer hasn't attempted to contact merchant yet for resolvable issues
- Issue could have been resolved within return policy but customer missed the window

Available chargeback categories (only use if chargeback_possible = true):
1. "fraud" - Fraudulent or unauthorized transactions
2. "not_received" - Goods or services not received
3. "duplicate" - Duplicate charges
4. "incorrect_amount" - Incorrect transaction amount
5. "defective" - Defective or not as described goods
6. "billing_error" - Billing errors or processing issues

CRITICAL REQUIREMENT: You MUST return exactly 2 documents for the specific category detected.

Document examples by category:

For "fraud":
- "Bank or credit card statement showing the charge"
- "Transaction receipt or email confirmation"

For "not_received":
- "Proof of purchase (e.g., invoice, receipt, order confirmation)"
- "Delivery receipt or tracking information"

For "defective":
- "Photo of the product showing the issue"
- "Proof of purchase (e.g., invoice, receipt, order confirmation)"

For "duplicate":
- "Bank or credit card statement showing both charges"
- "Transaction receipts for both charges"

For "incorrect_amount":
- "Proof of agreed amount (e.g., quote, invoice, advertisement)"
- "Bank or credit card statement showing the incorrect charge"

For "billing_error":
- "Bank or credit card statement showing the charge"
- "Correspondence with merchant about the error"

The customer_message should:
- Confirm eligibility based on their responses
- Briefly explain what category their issue falls under
- Let them know what documents they'll need to upload
- Be friendly and supportive

DO NOT mention temporary credit, investigation timeline, or next steps after document verification.`;

      userPrompt = `Based on all three customer responses, determine if a chargeback is possible and provide clear reasoning.`;

      tools = [
        {
          type: "function",
          function: {
            name: "evaluate_chargeback",
            description: "Evaluate if chargeback is possible and classify the reason",
            parameters: {
              type: "object",
              properties: {
                chargeback_possible: { 
                  type: "boolean",
                  description: "Whether the situation qualifies for a chargeback"
                },
                reasoning: {
                  type: "string",
                  description: "Clear internal explanation for the decision (for bank view only)"
                },
                category: {
                  type: "string",
                  enum: ["fraud", "not_received", "duplicate", "incorrect_amount", "defective", "billing_error"],
                  description: "The chargeback category (only if chargeback_possible is true)"
                },
                category_label: {
                  type: "string",
                  description: "Human-readable category label (only if chargeback_possible is true)"
                },
                documents: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Document name/description" },
                      uploadTypes: { type: "string", description: "Accepted file types" }
                    },
                    required: ["name", "uploadTypes"]
                  },
                  description: "Exactly 2 documents required (only if chargeback_possible is true)",
                  minItems: 2,
                  maxItems: 2
                },
                customer_message: {
                  type: "string",
                  description: "Message to show the customer - must include eligibility status and document requirements"
                }
              },
              required: ["chargeback_possible", "reasoning", "customer_message"],
              additionalProperties: false
            }
          }
        }
      ];
    } else {
      throw new Error('Invalid step parameter');
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: tools,
        tool_choice: { type: "function", function: { name: tools[0].function.name } }
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

    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log('Result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chargeback-precheck:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Failed to process chargeback precheck'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
