import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { transaction_id, customer_note, evidence_files } = await req.json();

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: 'transaction_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Evaluating customer evidence for transaction:', transaction_id);

    // Get transaction data
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', txError);
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build prompt for AI evaluation
    const evaluationPrompt = `You are evaluating customer-provided evidence for a chargeback dispute.

Transaction Details:
- Merchant: ${transaction.merchant_name}
- Amount: ${transaction.transaction_currency} ${transaction.transaction_amount}
- Date: ${new Date(transaction.transaction_time).toLocaleDateString()}
- Transaction ID: ${transaction.transaction_id}

Customer's Explanation:
${customer_note || 'No explanation provided'}

Evidence Files Provided: ${evidence_files?.length || 0} file(s)
${evidence_files?.map((f: any, i: number) => `${i + 1}. ${f.type} - ${f.name}`).join('\n') || 'No files'}

Evaluation Criteria (mark sufficient if ≥3 are met):
1. Mentions the merchant name, invoice, or order number
2. Shows attempt to resolve (e.g., "merchant refused refund," "contacted support")
3. Contains relevant date close to the transaction date
4. Contains merchant's acknowledgment (e.g., "service delivered," "non-refundable")
5. Document is clear, readable, and relevant

Based on the information provided, evaluate whether the evidence is sufficient to support continuing the chargeback dispute.

Respond with a JSON object ONLY (no other text):
{
  "sufficient": true or false,
  "reasons": ["reason 1", "reason 2", ...],
  "summary": "A brief summary of what was found in the evidence"
}`;

    // Call Lovable AI for evaluation
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert at evaluating dispute evidence. Always respond with valid JSON only.' },
          { role: 'user', content: evaluationPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI evaluation failed:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI evaluation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '{}';
    
    // Parse AI response
    let evaluation;
    try {
      // Remove markdown code blocks if present
      const cleanContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      evaluation = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      // Fallback evaluation
      evaluation = {
        sufficient: false,
        reasons: ['AI evaluation failed to parse response'],
        summary: 'Unable to automatically evaluate evidence. Manual review required.'
      };
    }

    // Store evidence with AI evaluation
    const { data: evidenceRecord, error: evidenceError } = await supabase
      .from('dispute_customer_evidence')
      .insert({
        transaction_id: transaction_id,
        customer_id: transaction.customer_id,
        evidence_type: evidence_files?.length > 0 ? 'files' : 'text',
        customer_note: customer_note,
        ai_sufficient: evaluation.sufficient,
        ai_summary: evaluation.summary,
        ai_reasons: evaluation.reasons,
      })
      .select()
      .single();

    if (evidenceError) {
      console.error('Failed to store evidence:', evidenceError);
      return new Response(
        JSON.stringify({ error: 'Failed to store evidence' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update evidence request status
    await supabase
      .from('dispute_customer_evidence_request')
      .update({ status: 'submitted' })
      .eq('transaction_id', transaction_id);

    // Update transaction to trigger needs_attention for bank review
    await supabase
      .from('transactions')
      .update({ needs_attention: true })
      .eq('id', transaction_id);

    console.log('Evidence evaluated successfully:', evaluation);

    return new Response(
      JSON.stringify({
        success: true,
        evaluation: {
          sufficient: evaluation.sufficient,
          reasons: evaluation.reasons,
          summary: evaluation.summary,
        },
        evidence_id: evidenceRecord.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in evaluate-customer-evidence:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});