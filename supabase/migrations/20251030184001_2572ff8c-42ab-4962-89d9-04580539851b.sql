-- Add APPROVE_WRITEOFF to the allowed decision values
ALTER TABLE public.dispute_decisions 
DROP CONSTRAINT dispute_decisions_decision_check;

ALTER TABLE public.dispute_decisions 
ADD CONSTRAINT dispute_decisions_decision_check 
CHECK (decision = ANY (ARRAY[
  'FILE_CHARGEBACK'::text,
  'FILE_CHARGEBACK_WITH_TEMP_CREDIT'::text,
  'WAIT_FOR_SETTLEMENT'::text,
  'REQUEST_REFUND_FROM_MERCHANT'::text,
  'DECLINE_NOT_ELIGIBLE'::text,
  'MANUAL_REVIEW'::text,
  'APPROVE_WRITEOFF'::text
]));