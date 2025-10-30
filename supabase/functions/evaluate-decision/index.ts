import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
};

interface Transaction {
  id: string;
  transaction_id: number;
  customer_id: string;
  transaction_time: string;
  transaction_amount: number;
  transaction_currency: string;
  local_transaction_amount: number;
  local_transaction_currency: string;
  merchant_name: string;
  merchant_id: number;
  merchant_category_code: number;
  acquirer_name: string;
  secured_indication: number;
  pos_entry_mode: number;
  is_wallet_transaction: boolean;
  wallet_type: string | null;
  settled: boolean;
  settlement_date: string | null;
  refund_received: boolean;
  refund_amount: number;
}

interface Dispute {
  id: string;
  reason_id: string;
  reason_label: string;
  custom_reason: string | null;
}

interface DocCheck {
  key: string;
  isValid: boolean;
  reason: string;
}

interface DecisionResult {
  decision: string;
  reason_summary: string;
  policy_code: string;
  flags: {
    writeOffRecommended?: boolean;
    writeOffApproved?: boolean;
    permanentCredit?: boolean;
    highRiskMCC?: boolean;
    idempotencyKey: string;
  };
  next_actions: string[];
  audit: {
    tx_id: number;
    customer_id: string;
    evaluated_at: string;
    inputs_hash: string;
    matched_rules: string[];
    docFindings: Record<string, any>;
  };
  base_amount_usd: number | null;
  remaining_amount_usd: number;
}

function calculateDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function deriveUSDAmounts(tx: Transaction): { base_amount_usd: number | null; remaining_amount_usd: number } {
  let base_amount_usd: number | null = null;
  
  if (tx.transaction_currency === 'USD') {
    base_amount_usd = tx.transaction_amount;
  } else if (tx.local_transaction_currency === 'USD') {
    base_amount_usd = tx.local_transaction_amount;
  }
  
  let remaining_amount_usd = base_amount_usd ?? 0;
  
  if (tx.refund_received && tx.transaction_currency === 'USD' && base_amount_usd !== null) {
    remaining_amount_usd = Math.max(base_amount_usd - tx.refund_amount, 0);
  }
  
  return { base_amount_usd, remaining_amount_usd };
}

async function computeInputsHash(tx: Transaction, dispute: Dispute, docCheck: DocCheck[]): Promise<string> {
  const input = {
    tx_id: tx.transaction_id,
    dispute: { reason_id: dispute.reason_id, custom_reason: dispute.custom_reason },
    docCheck
  };
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(input));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkDocumentSufficiency(reasonCode: string, docCheck: DocCheck[]): { sufficient: boolean; missing: string[] } {
  const validDocs = new Set(docCheck.filter(d => d.isValid).map(d => d.key));
  const missing: string[] = [];
  
  const requirements: Record<string, string[]> = {
    'UNAUTHORIZED': ['bank_statement'],
    'NOT_RECEIVED': ['invoice', 'tracking_proof'],
    'WRONG_ITEM': ['invoice', 'product_photo'],
    'NOT_AS_DESCRIBED': ['invoice', 'product_photo'],
    'DAMAGED_DEFECTIVE': ['invoice', 'product_photo'],
    'DUPLICATE': ['bank_statement'],
    'CANCELLED_BUT_CHARGED': ['cancellation_proof', 'bank_statement'],
    'REFUND_NOT_PROCESSED': ['cancellation_proof', 'bank_statement'],
    'INCORRECT_AMOUNT': ['invoice', 'bank_statement']
  };
  
  const required = requirements[reasonCode] || [];
  
  for (const doc of required) {
    if (!validDocs.has(doc)) {
      missing.push(doc);
    }
  }
  
  return { sufficient: missing.length === 0, missing };
}

function evaluateDecision(
  tx: Transaction,
  dispute: Dispute,
  docCheck: DocCheck[],
  base_amount_usd: number | null,
  remaining_amount_usd: number,
  days_since_tx: number,
  days_since_settlement: number | null,
  inputs_hash: string
): DecisionResult {
  const matched_rules: string[] = [];
  const idempotencyKey = crypto.randomUUID();
  
  // =======================================
  // RULE R0: Low-value automatic write-off (after document verification)
  // =======================================
  if (base_amount_usd !== null && base_amount_usd < 15) {
    matched_rules.push('R0');
    return {
      decision: 'APPROVE_WRITEOFF',
      reason_summary: 'Transaction under $15 - automatic write-off approved',
      policy_code: 'CB-POL-USD-v1:R0',
      flags: { 
        idempotencyKey,
        writeOffApproved: true,
        permanentCredit: true 
      },
      next_actions: ['issue_permanent_credit'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }

  // Hard blocks (B1-B4)
  if (tx.refund_received && remaining_amount_usd <= 0) {
    matched_rules.push('B1');
    return {
      decision: 'DECLINE_NOT_ELIGIBLE',
      reason_summary: 'Full refund already received',
      policy_code: 'CB-POL-USD-v1:B1',
      flags: { idempotencyKey },
      next_actions: [],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  if (
    tx.is_wallet_transaction &&
    (tx.wallet_type === 'Apple Pay' || tx.wallet_type === 'Google Pay') &&
    ![2, 212].includes(tx.secured_indication)
  ) {
    matched_rules.push('B2');
    return {
      decision: 'DECLINE_NOT_ELIGIBLE',
      reason_summary: 'Secured non-OTP wallet transaction',
      policy_code: 'CB-POL-USD-v1:B2',
      flags: { idempotencyKey },
      next_actions: [],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  if (days_since_tx > 120) {
    matched_rules.push('B3');
    return {
      decision: 'DECLINE_NOT_ELIGIBLE',
      reason_summary: 'Transaction older than 120 days',
      policy_code: 'CB-POL-USD-v1:B3',
      flags: { idempotencyKey },
      next_actions: [],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  if (!tx.settled && days_since_tx > 21) {
    matched_rules.push('B4');
    return {
      decision: 'DECLINE_NOT_ELIGIBLE',
      reason_summary: 'Unsettled transaction past 21 days',
      policy_code: 'CB-POL-USD-v1:B4',
      flags: { idempotencyKey },
      next_actions: [],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // Document sufficiency check
  const docSufficiency = checkDocumentSufficiency(dispute.reason_id, docCheck);
  
  // Priority rules (R1-R13)
  
  // R1: WAIT_FOR_SETTLEMENT
  if (!tx.settled && days_since_tx <= 3) {
    matched_rules.push('R1');
    return {
      decision: 'WAIT_FOR_SETTLEMENT',
      reason_summary: 'Awaiting network settlement (≤3 days).',
      policy_code: 'CB-POL-USD-v1:R1',
      flags: { idempotencyKey },
      next_actions: ['schedule_recheck_24h'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // R2: Merchant refund path (Meta/Facebook)
  if (
    (tx.merchant_name.toLowerCase().includes('facebook') || tx.merchant_name.toLowerCase().includes('meta')) &&
    tx.settled &&
    days_since_settlement !== null &&
    days_since_settlement < 7
  ) {
    matched_rules.push('R2');
    return {
      decision: 'REQUEST_REFUND_FROM_MERCHANT',
      reason_summary: 'Meta/Facebook merchant - request refund within settlement window',
      policy_code: 'CB-POL-USD-v1:R2',
      flags: { idempotencyKey },
      next_actions: ['create_merchant_refund_task'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
        inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // R3: High-risk MCC
  const highRiskMCCs = [5968, 4215, 5815, 6300, 5411, 7922, 7011, 4121, 4722, 9399, 4814, 7375, 7394, 4899, 7997];
  if (highRiskMCCs.includes(tx.merchant_category_code)) {
    matched_rules.push('R3');
    if (docSufficiency.sufficient) {
      return {
        decision: 'FILE_CHARGEBACK',
        reason_summary: 'High-risk MCC - chargeback filed without temp credit',
        policy_code: 'CB-POL-USD-v1:R3',
        flags: { highRiskMCC: true, idempotencyKey },
        next_actions: ['create_dispute', 'log_activity', 'notify_dashboard'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    } else {
      return {
        decision: 'MANUAL_REVIEW',
        reason_summary: 'High-risk MCC with insufficient documents',
        policy_code: 'CB-POL-USD-v1:R3',
        flags: { highRiskMCC: true, idempotencyKey },
        next_actions: ['queue_ops_case', 'request_missing_docs'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R4: Secured OTP present
  if ([2, 212].includes(tx.secured_indication)) {
    matched_rules.push('R4');
    if (dispute.reason_id === 'UNAUTHORIZED') {
      return {
        decision: 'MANUAL_REVIEW',
        reason_summary: 'OTP present conflicts with unauthorized claim',
        policy_code: 'CB-POL-USD-v1:R4',
        flags: { idempotencyKey },
        next_actions: ['queue_ops_case', 'escalate_fraud_team'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
    if (docSufficiency.sufficient) {
      return {
        decision: 'FILE_CHARGEBACK_WITH_TEMP_CREDIT',
        reason_summary: '3DS/OTP secured transaction with valid docs - temp credit approved',
        policy_code: 'CB-POL-USD-v1:R4',
        flags: { idempotencyKey },
        next_actions: ['create_dispute', 'issue_temp_credit', 'log_activity'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R5: POS fallback/manual entry
  if ([90, 91].includes(tx.pos_entry_mode)) {
    matched_rules.push('R5');
    if (docSufficiency.sufficient) {
      return {
        decision: 'FILE_CHARGEBACK',
        reason_summary: 'Manual entry POS - chargeback without temp credit',
        policy_code: 'CB-POL-USD-v1:R5',
        flags: { idempotencyKey },
        next_actions: ['create_dispute', 'log_activity'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    } else {
      return {
        decision: 'MANUAL_REVIEW',
        reason_summary: 'Manual entry POS with insufficient docs',
        policy_code: 'CB-POL-USD-v1:R5',
        flags: { idempotencyKey },
        next_actions: ['queue_ops_case', 'request_missing_docs'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R6: Wallets (non-blocked)
  if (
    tx.is_wallet_transaction &&
    (tx.wallet_type !== 'Apple Pay' && tx.wallet_type !== 'Google Pay' || [2, 212].includes(tx.secured_indication))
  ) {
    matched_rules.push('R6');
    if (docSufficiency.sufficient) {
      const withTempCredit = [2, 212].includes(tx.secured_indication);
      return {
        decision: withTempCredit ? 'FILE_CHARGEBACK_WITH_TEMP_CREDIT' : 'FILE_CHARGEBACK',
        reason_summary: withTempCredit ? 'Wallet with OTP - temp credit allowed' : 'Wallet transaction - chargeback filed',
        policy_code: 'CB-POL-USD-v1:R6',
        flags: { idempotencyKey },
        next_actions: withTempCredit ? ['create_dispute', 'issue_temp_credit'] : ['create_dispute'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R7: Subscription cancelled / refund promised
  if (['CANCELLED_BUT_CHARGED', 'REFUND_NOT_PROCESSED'].includes(dispute.reason_id)) {
    const hasCancellationProof = docCheck.some(d => d.key === 'cancellation_proof' && d.isValid);
    const hasCommunication = docCheck.some(d => d.key === 'communication' && d.isValid);
    
    if (hasCancellationProof || hasCommunication) {
      matched_rules.push('R7');
      return {
        decision: days_since_tx <= 60 ? 'FILE_CHARGEBACK_WITH_TEMP_CREDIT' : 'FILE_CHARGEBACK',
        reason_summary: days_since_tx <= 60 ? 'Cancellation within 60 days - temp credit issued' : 'Cancellation over 60 days - chargeback filed',
        policy_code: 'CB-POL-USD-v1:R7',
        flags: { idempotencyKey },
        next_actions: days_since_tx <= 60 ? ['create_dispute', 'issue_temp_credit'] : ['create_dispute'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R8: Not received
  if (dispute.reason_id === 'NOT_RECEIVED' && docSufficiency.sufficient) {
    matched_rules.push('R8');
    return {
      decision: 'FILE_CHARGEBACK_WITH_TEMP_CREDIT',
      reason_summary: 'Physical goods not received - temp credit issued',
      policy_code: 'CB-POL-USD-v1:R8',
      flags: { idempotencyKey },
      next_actions: ['create_dispute', 'issue_temp_credit'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
          inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // R9: Wrong / damaged / not as described
  if (['WRONG_ITEM', 'DAMAGED_DEFECTIVE', 'NOT_AS_DESCRIBED'].includes(dispute.reason_id) && docSufficiency.sufficient) {
    matched_rules.push('R9');
    return {
      decision: 'FILE_CHARGEBACK_WITH_TEMP_CREDIT',
      reason_summary: 'Product quality issue - temp credit issued',
      policy_code: 'CB-POL-USD-v1:R9',
      flags: { idempotencyKey },
      next_actions: ['create_dispute', 'issue_temp_credit'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
          inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // R10: Duplicate / incorrect amount
  if (['DUPLICATE', 'INCORRECT_AMOUNT'].includes(dispute.reason_id) && docSufficiency.sufficient) {
    matched_rules.push('R10');
    return {
      decision: 'FILE_CHARGEBACK',
      reason_summary: 'Duplicate or incorrect amount - chargeback filed',
      policy_code: 'CB-POL-USD-v1:R10',
      flags: { idempotencyKey },
      next_actions: ['create_dispute'],
      audit: {
        tx_id: tx.transaction_id,
        customer_id: tx.customer_id,
        evaluated_at: new Date().toISOString(),
          inputs_hash,
        matched_rules,
        docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
      },
      base_amount_usd,
      remaining_amount_usd
    };
  }
  
  // R11: Unauthorized (no OTP)
  if (dispute.reason_id === 'UNAUTHORIZED' && ![2, 212].includes(tx.secured_indication)) {
    matched_rules.push('R11');
    if (docSufficiency.sufficient) {
      return {
        decision: 'FILE_CHARGEBACK_WITH_TEMP_CREDIT',
        reason_summary: 'Unauthorized transaction without OTP - temp credit issued',
        policy_code: 'CB-POL-USD-v1:R11',
        flags: { idempotencyKey },
        next_actions: ['create_dispute', 'issue_temp_credit'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    } else {
      return {
        decision: 'MANUAL_REVIEW',
        reason_summary: 'Unauthorized claim with insufficient docs',
        policy_code: 'CB-POL-USD-v1:R11',
        flags: { idempotencyKey },
        next_actions: ['queue_ops_case', 'request_missing_docs'],
        audit: {
          tx_id: tx.transaction_id,
          customer_id: tx.customer_id,
          evaluated_at: new Date().toISOString(),
          inputs_hash,
          matched_rules,
          docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
        },
        base_amount_usd,
        remaining_amount_usd
      };
    }
  }
  
  // R13: Default to MANUAL_REVIEW
  const flags: DecisionResult['flags'] = { idempotencyKey };
  matched_rules.push('R13');
  return {
    decision: 'MANUAL_REVIEW',
    reason_summary: 'Case requires manual review',
    policy_code: 'CB-POL-USD-v1:R13',
    flags,
    next_actions: ['queue_ops_case'],
    audit: {
      tx_id: tx.transaction_id,
      customer_id: tx.customer_id,
      evaluated_at: new Date().toISOString(),
      inputs_hash,
      matched_rules,
      docFindings: Object.fromEntries(docCheck.map(d => [d.key, { valid: d.isValid, reason: d.reason }]))
    },
    base_amount_usd,
    remaining_amount_usd
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { disputeId, transactionId, docCheck } = await req.json();
    
    if (!disputeId || !transactionId || !docCheck) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Evaluating decision for:', { disputeId, transactionId, userId: user.id });

    // Fetch transaction
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !tx) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('id, reason_id, reason_label, custom_reason')
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dispute not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute amounts and days
    const { base_amount_usd, remaining_amount_usd } = deriveUSDAmounts(tx);
    const days_since_tx = calculateDaysSince(tx.transaction_time);
    const days_since_settlement = tx.settlement_date ? calculateDaysSince(tx.settlement_date) : null;

    // Check for existing decision (idempotency)
    const inputs_hash = await computeInputsHash(tx, dispute, docCheck);
    const { data: existingDecision } = await supabase
      .from('dispute_decisions')
      .select('*')
      .eq('transaction_id', tx.id)
      .eq('inputs_hash', inputs_hash)
      .maybeSingle();

    if (existingDecision) {
      console.log('Returning existing decision (idempotent)');
      return new Response(
        JSON.stringify({ success: true, decision: existingDecision }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Evaluate decision
    const result = evaluateDecision(
      tx,
      dispute,
      docCheck,
      base_amount_usd,
      remaining_amount_usd,
      days_since_tx,
      days_since_settlement,
      inputs_hash
    );

    console.log('Decision evaluated:', result.decision, result.policy_code);

    // Store decision
    const { error: insertError } = await supabase
      .from('dispute_decisions')
      .insert({
        dispute_id: disputeId,
        transaction_id: tx.id,
        customer_id: tx.customer_id,
        decision: result.decision,
        reason_summary: result.reason_summary,
        policy_code: result.policy_code,
        flags: result.flags,
        next_actions: result.next_actions,
        audit: result.audit,
        inputs_hash: inputs_hash,
        base_amount_usd: result.base_amount_usd,
        remaining_amount_usd: result.remaining_amount_usd
      });

    if (insertError) {
      console.error('Failed to store decision:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to store decision' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, decision: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in evaluate-decision:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
