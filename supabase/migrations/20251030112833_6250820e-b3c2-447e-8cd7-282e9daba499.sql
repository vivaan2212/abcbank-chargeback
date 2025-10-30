-- Add new action types for representment to the check constraint
ALTER TABLE public.chargeback_actions
DROP CONSTRAINT IF EXISTS chargeback_actions_action_type_check;

ALTER TABLE public.chargeback_actions
ADD CONSTRAINT chargeback_actions_action_type_check
CHECK (action_type = ANY (ARRAY[
  'TEMPORARY_CREDIT_ONLY'::text,
  'CHARGEBACK_FILED'::text,
  'CHARGEBACK_NO_TEMP'::text,
  'WAIT_FOR_REFUND'::text,
  'WAIT_FOR_SETTLEMENT'::text,
  'MANUAL_REVIEW'::text,
  'EXPIRED_NOT_SETTLED'::text,
  'representment_accepted'::text,
  'representment_rejected'::text
]));