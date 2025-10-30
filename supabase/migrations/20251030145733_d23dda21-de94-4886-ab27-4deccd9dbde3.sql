-- Create knowledge base table for chargeback information
CREATE TABLE public.chargeback_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chargeback_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read knowledge base
CREATE POLICY "Authenticated users can read knowledge base"
ON public.chargeback_knowledge_base
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow bank admins to manage knowledge base
CREATE POLICY "Bank admins can manage knowledge base"
ON public.chargeback_knowledge_base
FOR ALL
USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_chargeback_knowledge_base_updated_at
BEFORE UPDATE ON public.chargeback_knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert knowledge base content
INSERT INTO public.chargeback_knowledge_base (category, title, content, keywords) VALUES
('introduction', 'What is a Chargeback', 'A chargeback is a formal process through which a cardholder disputes a transaction made with a debit or credit card. It allows the customer''s bank (the issuing bank) to reverse funds from the merchant''s bank (the acquiring bank) when a valid reason for dispute exists. The process is governed by card network regulations — primarily Visa Core Rules (VCR) and Mastercard Chargeback Guide (MCG) — and provides a structured mechanism to ensure fairness, accountability, and transparency between customers, merchants, and banks.', ARRAY['chargeback', 'dispute', 'definition', 'introduction', 'card network']),

('objectives', 'Chargeback Framework Objectives', 'The objectives of the chargeback framework are: 1) Protect customers from unauthorized or incorrect charges. 2) Ensure merchants deliver goods and services as promised. 3) Provide standardized resolution procedures across all card networks. 4) Maintain financial ecosystem integrity by penalizing misuse and fraud.', ARRAY['objectives', 'protection', 'standards', 'fraud prevention']),

('entities', 'Entities Involved in Chargebacks', 'The entities involved in chargebacks are: Cardholder (Customer) – initiates the dispute. Issuing Bank – the customer''s bank that reviews and files chargebacks. Acquiring Bank – the merchant''s bank that receives and responds to chargebacks. Merchant – the business that received the payment. Card Network (Visa / Mastercard) – provides rules, codes, and arbitration mechanisms.', ARRAY['entities', 'participants', 'banks', 'merchant', 'card network']),

('journey', 'Customer Journey - Transaction Stage', 'Stage 1: Transaction - The cardholder completes a payment to a merchant via card or digital channel. The transaction posts to their account.', ARRAY['journey', 'transaction', 'payment', 'stage']),

('journey', 'Customer Journey - Dispute Initiation', 'Stage 2: Dispute Initiation - If the customer notices an issue (fraudulent charge, product not received, incorrect amount, etc.), they contact the issuing bank. The bank verifies eligibility based on card network rules. Required inputs: Transaction ID, merchant name, date, amount; Reason for dispute; Supporting evidence (receipts, screenshots, emails, proof of cancellation). If valid, the bank creates a dispute case internally.', ARRAY['dispute', 'initiation', 'filing', 'evidence', 'requirements']),

('reason-codes', 'Visa Reason Categories', 'Visa Reason Categories: 1) Fraud – e.g., 10.4 "Other Fraud–Card Absent Environment" 2) Authorization – e.g., 11.3 "No Authorization" 3) Processing Errors – e.g., 12.5 "Incorrect Amount" 4) Consumer Disputes – e.g., 13.1 "Services Not Provided or Merchandise Not Received"', ARRAY['visa', 'reason codes', 'categories', 'fraud', 'authorization']),

('reason-codes', 'Mastercard Reason Categories', 'Mastercard Reason Categories: 1) Fraud – 4837, 4840, 4870 2) Authorization – 4808 3) Processing Errors – 4834 4) Cardholder Disputes – 4853, 4860. Each code specifies what evidence the customer and merchant must provide.', ARRAY['mastercard', 'reason codes', 'categories', 'fraud']),

('temporary-credit', 'Temporary Credit Explained', 'Once the bank files a chargeback, the customer typically receives a provisional (temporary) credit for the disputed amount. This credit is conditional until investigation concludes. If the customer wins, it becomes permanent. If the merchant wins, the bank reverses the credit. Spending this credit before resolution may result in re-debit if the case is lost.', ARRAY['temporary credit', 'provisional credit', 'refund', 'conditional']),

('representment', 'Merchant Representment Process', 'After a chargeback is filed, the merchant receives notice from their acquiring bank and can: 1) Accept the chargeback – acknowledges the customer''s claim, refund stands permanently. 2) Represent (dispute) the chargeback – provides counter-evidence proving the transaction was valid. Common merchant evidence includes: Delivery confirmation, Service usage logs, Refund already processed, Customer agreement terms, Communication history.', ARRAY['representment', 'merchant response', 'evidence', 'counter-evidence']),

('representment', 'Representment Evaluation', 'The issuing bank reviews both the customer''s and the merchant''s evidence. Visa calls this stage "Dispute Response Review." Mastercard refers to it as "First Chargeback and Second Presentment." Outcomes: Customer Favor → case closed, temporary credit becomes permanent. Merchant Favor → chargeback reversed, funds returned to merchant, temporary credit debited from customer. Inconclusive → may proceed to pre-arbitration.', ARRAY['evaluation', 'review', 'decision', 'outcome']),

('pre-arbitration', 'Pre-Arbitration Phase', 'Pre-arbitration (called Pre-Arb by Mastercard or Pre-Dispute by Visa) is the stage where one party disagrees with the previous decision and wants another review before formal arbitration by the network. It occurs when: Issuer believes merchant''s representment is invalid; New evidence appears after representment; The acquiring bank submits pre-arb if the issuer previously ruled in error. During pre-arbitration, the customer may be asked for additional documentation or clarification. The card network sets strict timelines: Visa: 20 calendar days; Mastercard: 30 calendar days.', ARRAY['pre-arbitration', 'pre-arb', 'appeal', 'additional evidence', 'timelines']),

('arbitration', 'Arbitration Phase', 'Arbitration is the final stage where the card network (Visa or Mastercard) makes a binding decision on the dispute. Process: 1) The dissatisfied party submits the case to the network with all evidence. 2) The network''s dispute resolution panel reviews the case objectively. 3) The network determines the winning party and assigns financial liability. Timelines: Visa Arbitration must be filed within 10 days after pre-arb decision. Mastercard Arbitration must be filed within 45 days. The arbitration decision is final and binding; no further appeal is possible. The losing party may incur arbitration and processing fees (usually USD 500–1,000 per case).', ARRAY['arbitration', 'final decision', 'binding', 'fees', 'network decision']),

('timeframes', 'Chargeback Timeframes and Deadlines', 'Customer dispute initiation: 120 days from transaction (both Visa and Mastercard). Issuer filing chargeback: Visa within 30 days, Mastercard within 45 days. Merchant representment: Visa 30 days, Mastercard 45 days. Pre-arbitration: Visa 20 days, Mastercard 30 days. Arbitration filing: Visa 10 days after pre-arb, Mastercard 45 days after pre-arb. Note: Timelines can vary based on transaction type, region, and fraud rules.', ARRAY['timeframes', 'deadlines', 'timeline', 'time limits', 'duration']),

('evidence', 'Customer Evidence Requirements', 'Customer Evidence: Proof of non-delivery or service failure; Screenshots of merchant communication; Refund request proof or cancellation acknowledgment; ID documents (for fraud disputes). Banks rely on this evidence to determine credibility and compliance with card network standards.', ARRAY['evidence', 'documentation', 'proof', 'requirements', 'customer evidence']),

('evidence', 'Merchant Evidence Requirements', 'Merchant Evidence: Proof of fulfillment (delivery receipts, tracking numbers); Copy of signed invoice or authorization; Logs showing usage or service access; Customer acknowledgment of terms. Banks rely on this evidence to determine credibility and compliance with card network standards.', ARRAY['evidence', 'merchant evidence', 'proof', 'documentation']),

('fraud', 'Fraud vs Service Disputes', 'Fraud-Related disputes involve card used without authorization, examples include lost/stolen card and identity theft. Service-Related disputes involve goods/service not received or not as described, examples include missing shipment, defective product, subscription cancellation ignored. Fraud disputes usually rely on bank and network data (authorization logs, fraud indicators), while service disputes rely on customer documentation.', ARRAY['fraud', 'service dispute', 'unauthorized', 'types of disputes']),

('rules', 'Duplicate and Unauthorized Claims', 'Duplicate chargebacks or simultaneous refund + chargeback are prohibited. Visa and Mastercard both restrict multiple filings on the same transaction except when new evidence arises under pre-arbitration. Banks monitor repeated misuse to prevent abuse.', ARRAY['duplicate', 'restrictions', 'prohibited', 'rules']),

('status', 'Chargeback Status Definitions', 'Filed: Chargeback submitted to network. Under Review: Waiting for merchant or network response. Represented: Merchant has submitted counter-evidence. Pre-Arbitration: Further review before final decision. Arbitration: Network reviewing evidence. Closed – Customer Favor: Customer wins; credit permanent. Closed – Merchant Favor: Merchant wins; credit reversed. Withdrawn / Settled: Case resolved outside network.', ARRAY['status', 'stages', 'definitions', 'case status']),

('rights', 'Customer Rights', 'Customer rights include: Right to file a dispute within 120 days of transaction posting. Right to receive a provisional refund (temporary credit) during investigation. Right to be informed about case progress and deadlines. Right to provide supporting documentation. Right to appeal through the bank if representment evidence seems invalid (within pre-arb window).', ARRAY['rights', 'customer rights', 'protections']),

('responsibilities', 'Customer Responsibilities', 'Customer responsibilities: Provide truthful and complete information. Respond promptly when asked for evidence. Avoid filing fraudulent or duplicate claims. Keep transaction receipts and communication records. Understand that misuse of chargebacks can lead to account review or restrictions.', ARRAY['responsibilities', 'obligations', 'customer duties']),

('outcomes', 'Possible Chargeback Outcomes', 'Merchant accepts chargeback: Refund becomes permanent. Merchant represents: Bank reviews both sides. Bank accepts merchant evidence: Temporary credit removed. Bank contests merchant evidence: Case proceeds to pre-arbitration. Merchant wins arbitration: Case closed, credit reversed. Customer wins arbitration: Refund permanent, case closed.', ARRAY['outcomes', 'results', 'resolution', 'final decision']),

('comparison', 'Visa vs Mastercard Differences', 'Key differences: Terminology differs (Dispute vs Chargeback, Pre-Dispute vs Pre-Arbitration). Filing Deadlines: Visa 30-120 days, Mastercard 45-120 days. Pre-Arbitration Window: Visa 20 days, Mastercard 30 days. Both networks bill arbitration fees to losing party. Visa has Compelling Evidence 3.0 Rules, Mastercard has Fraud Dispute Framework 2023.', ARRAY['visa', 'mastercard', 'comparison', 'differences', 'networks']),

('rules-general', 'Common Visa/Mastercard Rules', 'Disputes must be raised within 120 calendar days. Customers cannot dispute the same transaction more than once unless new information exists. Refund requests and chargebacks cannot coexist. Chargebacks cannot be used for buyer''s remorse. False or abusive disputes can result in restriction or blacklisting. Visa allows Compelling Evidence to refute fraudulent claims. Mastercard has Collaboration Case Management.', ARRAY['rules', 'regulations', 'requirements', 'restrictions']),

('best-practices', 'Best Practices for Customers', 'Always attempt direct resolution with the merchant before disputing. File disputes promptly after identifying an issue. Provide comprehensive and clear supporting documentation. Monitor dashboard notifications for representment or evidence requests. Retain receipts and screenshots until final closure. Understand that the bank acts as an intermediary; final decisions follow card network rules.', ARRAY['best practices', 'tips', 'recommendations', 'guidance']),

('dos-donts', 'Customer Do''s and Don''ts', 'Do: Use chargebacks for genuine errors or fraud. Cooperate with investigation timelines. Provide accurate documentation. Don''t: File chargebacks for personal preference changes or late refunds. Submit false claims. Ignore communication from the bank.', ARRAY['dos', 'donts', 'guidelines', 'warnings']);