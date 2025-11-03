import { format } from "date-fns";
import { CheckCircle2, Circle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState, useEffect } from "react";
import { RepresentmentPanel } from "./RepresentmentPanel";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ArtifactsViewer, { ArtifactDoc } from "./ArtifactsViewer";
import { PreviewPane } from "./PreviewPane";

interface DisputeDetailProps {
  dispute: {
    id: string;
    conversation_id: string;
    status: string;
    eligibility_status: string | null;
    reason_label: string | null;
    custom_reason: string | null;
    order_details: string | null;
    documents: any;
    eligibility_reasons: string[] | null;
    created_at: string;
    updated_at: string;
    chargeback_representment_static?: {
      id: string;
      will_be_represented: boolean;
      representment_status: string;
      merchant_document_url?: string;
      merchant_reason_text?: string;
      source?: string;
    };
    transaction?: {
      id?: string;
      transaction_id?: number;
      transaction_time?: string;
      transaction_amount?: number;
      transaction_currency?: string;
      merchant_name?: string;
      merchant_category_code?: number;
      acquirer_name?: string;
      refund_amount?: number;
      refund_received?: boolean;
      settled?: boolean;
      settlement_date?: string | null;
      local_transaction_amount?: number;
      local_transaction_currency?: string;
      is_wallet_transaction?: boolean;
      wallet_type?: string | null;
      pos_entry_mode?: number;
      secured_indication?: number;
      dispute_status?: string;
      needs_attention?: boolean;
      temporary_credit_provided?: boolean;
      temporary_credit_amount?: number;
      temporary_credit_currency?: string;
    };
  };
  onUpdate?: () => void;
}

const DisputeDetail = ({ dispute, onUpdate }: DisputeDetailProps) => {
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});
  const [evidenceRequest, setEvidenceRequest] = useState<any>(null);
  const [customerEvidence, setCustomerEvidence] = useState<any>(null);
  const [disputeDocuments, setDisputeDocuments] = useState<ArtifactDoc[]>([]);
  const [previewPaneOpen, setPreviewPaneOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{
    url: string;
    extractedFields: Array<{ label: string; value: string }>;
  } | null>(null);
  const queryClient = useQueryClient();

  // Load evidence request and submission data
  useEffect(() => {
    const loadEvidenceData = async () => {
      if (!dispute.transaction?.id) return;

      // Check if evidence was requested
      const { data: reqData } = await supabase
        .from('dispute_customer_evidence_request')
        .select('*')
        .eq('transaction_id', dispute.transaction.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setEvidenceRequest(reqData);
      console.log('[DisputeDetail] evidenceRequest', reqData);

      // Check if evidence was submitted
      const { data: evidenceData } = await supabase
        .from('dispute_customer_evidence')
        .select('*')
        .eq('transaction_id', dispute.transaction.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setCustomerEvidence(evidenceData);
      console.log('[DisputeDetail] customerEvidence', evidenceData);

      // Load dispute documents from database
      const { data: docsData } = await supabase
        .from('dispute_documents')
        .select('*')
        .eq('dispute_id', dispute.id)
        .order('created_at', { ascending: true });

      if (docsData && docsData.length > 0) {
        const artifacts: ArtifactDoc[] = docsData.map(doc => ({
          requirementName: doc.requirement_name,
          name: doc.file_name,
          size: doc.file_size,
          type: doc.file_type,
          path: doc.storage_path
        }));
        setDisputeDocuments(artifacts);
      }
    };

    loadEvidenceData();
  }, [dispute.id, dispute.transaction?.id, dispute.chargeback_representment_static?.representment_status, dispute.transaction?.dispute_status]);

  const toggleSection = (index: number) => {
    setOpenSections(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleRepresentmentActionComplete = () => {
    // Refresh data
    queryClient.invalidateQueries({ queryKey: ['disputes'] });
    onUpdate?.();
  };

  const getActivitySteps = () => {
    const steps: Array<{
      label: string;
      description: string;
      completed: boolean;
      timestamp: string;
      hasDetails: boolean;
      color?: 'yellow' | 'blue' | 'green' | 'default';
      details?: {
        items: Array<{ label: string; icon?: string; value?: string }>;
      };
    }> = [
      {
        label: "Received a disputed transaction",
        description: "Disputed transaction",
        completed: true,
        timestamp: dispute.created_at,
        hasDetails: true,
        details: {
          items: [
            { label: "Disputed transaction", icon: "📄" }
          ]
        }
      },
    ];

    if (dispute.transaction) {
      steps.push({
        label: "Transaction selected",
        description: `Selected ${dispute.transaction.merchant_name} transaction`,
        completed: ["transaction_selected", "eligibility_checked", "reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.created_at,
        hasDetails: false,
      });

      // Add transaction security analysis if we have eligibility data
      if (dispute.eligibility_status && dispute.transaction.is_wallet_transaction !== undefined) {
        steps.push({
          label: "Transaction is secured",
          description: "See reasoning",
          completed: true,
          timestamp: dispute.created_at,
          hasDetails: true,
          details: {
            items: [
              { label: "POS entry mode", value: dispute.transaction.pos_entry_mode?.toString().padStart(2, '0') || "N/A" },
              { label: "Wallet type", value: dispute.transaction.wallet_type || "None" },
              { label: "Secured indication", value: dispute.transaction.secured_indication !== undefined ? dispute.transaction.secured_indication.toString() : "None" }
            ]
          }
        });
      }
    }

    if (dispute.eligibility_status) {
      const isEligible = dispute.eligibility_status === "ELIGIBLE";
      const reasons = dispute.eligibility_reasons || [];
      
      steps.push({
        label: isEligible ? "Transaction is eligible" : "Transaction is not eligible",
        description: isEligible ? "Transaction can be disputed" : (reasons.length > 0 ? reasons[0] : "See reasoning"),
        completed: ["eligibility_checked", "reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.created_at,
        hasDetails: !isEligible && reasons.length > 0,
        details: !isEligible && reasons.length > 0 ? {
          items: reasons.map(reason => ({ label: reason }))
        } : undefined
      });
    }

    if (dispute.transaction?.settled) {
      steps.push({
        label: "Transaction is settled",
        description: dispute.transaction.settlement_date 
          ? `Settled on ${format(new Date(dispute.transaction.settlement_date), "dd MMM yyyy")}`
          : "Transaction marked as settled",
        completed: true,
        timestamp: dispute.transaction.settlement_date || dispute.transaction.transaction_time || dispute.created_at,
        hasDetails: false,
      });
    }

    if (dispute.order_details) {
      steps.push({
        label: "Order details provided",
        description: "Customer provided additional information",
        completed: true,
        timestamp: dispute.created_at,
        hasDetails: true,
        details: {
          items: [
            { label: dispute.order_details }
          ]
        }
      });
    }

    if (dispute.reason_label) {
      steps.push({
        label: "Reason selected",
        description: dispute.reason_label + (dispute.custom_reason ? `: ${dispute.custom_reason}` : ""),
        completed: ["reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.updated_at,
        hasDetails: dispute.custom_reason ? true : false,
        details: dispute.custom_reason ? {
          items: [
            { label: "Custom reason", value: dispute.custom_reason }
          ]
        } : undefined
      });
    }

    if (dispute.status === "mismatch" || dispute.status === "not_eligible") {
      steps.push({
        label: dispute.status === "mismatch" ? "Details mismatch detected" : "Not eligible for chargeback",
        description: dispute.status === "mismatch" 
          ? "Order details don't match chargeback reason"
          : "Reason does not meet chargeback criteria",
        completed: true,
        timestamp: dispute.updated_at,
        hasDetails: false,
      });
    }

    if (dispute.documents) {
      steps.push({
        label: "Documents uploaded",
        description: "Supporting documents provided",
        completed: ["documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.updated_at,
        hasDetails: false,
      });
    }

    if (dispute.status === "under_review") {
      steps.push({
        label: "Marked as reviewed",
        description: "Chargeback under bank review",
        completed: true,
        timestamp: dispute.updated_at,
        hasDetails: true,
        details: {
          items: [
            { label: "Reviewed by", value: "Bank Admin" }
          ]
        }
      });
    }

    // Add evidence request and submission steps
    const repStatus = dispute.chargeback_representment_static?.representment_status;
    
    if (evidenceRequest && (repStatus === 'awaiting_customer_info' || customerEvidence)) {
      const submitted = evidenceRequest.status === 'submitted';
      steps.push({
        label: submitted ? "Customer evidence submitted" : "Waiting for customer response",
        description: submitted ? "Evidence received from customer" : "Requested additional evidence from customer",
        completed: true,
        timestamp: evidenceRequest.requested_at || evidenceRequest.created_at,
        hasDetails: true,
        details: {
          items: [
            { label: "Status", value: submitted ? 'Evidence submitted' : 'Awaiting response' }
          ]
        }
      });
    }

    // Fallback: if transaction reflects evidence submitted but no record loaded yet
    if (!customerEvidence && dispute.transaction?.dispute_status === 'evidence_submitted') {
      steps.push({
        label: "Customer evidence submitted",
        description: "Evidence received from customer",
        completed: true,
        timestamp: dispute.updated_at,
        hasDetails: false,
      });
    }

    if (customerEvidence) {
      steps.push({
        label: "Customer uploaded evidence",
        description: customerEvidence.ai_sufficient 
          ? "Evidence reviewed and found sufficient"
          : "Evidence reviewed - may need additional review",
        completed: true,
        timestamp: customerEvidence.created_at,
        hasDetails: true,
        details: {
          items: [
            { label: "AI Evaluation", value: customerEvidence.ai_sufficient ? "✓ Sufficient" : "⚠ Insufficient" },
            { label: "Summary", value: customerEvidence.ai_summary || "No summary available" }
          ]
        }
      });
    }

    // When merchant representment is accepted (merchant won)
    // Only show these logs if representment workflow actually happened (customer submitted evidence)
    if (repStatus === 'accepted_by_bank' && dispute.transaction && customerEvidence) {
      const network = dispute.transaction.acquirer_name || "Network";
      const networkRefs: Record<string, string> = {
        "Mastercard": "https://www.mastercardconnect.com/chargeback",
        "Visa": "https://www.visa.com/viw",
        "Amex": "https://www.americanexpress.com",
        "Rupay": "https://www.rupay.co.in"
      };
      const networkPortal = networkRefs[network] || null;

      // Step 1: Evidence reviewed
      steps.push({
        label: "Evidence reviewed and found valid; customer chargeback request to be recalled",
        description: "Reviewed by Pace",
        completed: true,
        timestamp: dispute.updated_at,
        hasDetails: true,
        color: 'yellow',
        details: {
          items: [
            { label: "Invoice verified and matches transaction details." },
            { label: "Merchant terms state the service is non-refundable." },
            { label: "Evidence confirms customer received and used the service." },
            { label: "No evidence of fraud or unauthorized access." },
            { label: "Transaction consistent with past customer behavior." }
          ]
        }
      });

      // Step 2: Chargeback recalled from network
      const caseId = (dispute.transaction as any).chargeback_case_id || "N/A";
      steps.push({
        label: `Chargeback request for Ref. No. ${caseId} has been recalled from ${network} network`,
        description: "Recall details",
        completed: true,
        timestamp: dispute.updated_at,
        hasDetails: networkPortal ? true : false,
        color: 'blue',
        details: networkPortal ? {
          items: [
            { label: "Network Portal", value: networkPortal }
          ]
        } : undefined
      });

      // Step 3: Temporary credit reversed
      if (dispute.transaction.temporary_credit_provided) {
        const reversalRef = dispute.transaction.transaction_id || "N/A";
        const reversalDate = (dispute.transaction as any).temporary_credit_reversal_at || dispute.updated_at;
        steps.push({
          label: `Temporary credit has been reversed. Reversal recorded under transaction Ref. No. ${reversalRef}.`,
          description: "Transaction details",
          completed: true,
          timestamp: reversalDate,
          hasDetails: true,
          color: 'green',
          details: {
            items: [
              { label: "Amount reversed", value: `${dispute.transaction.temporary_credit_currency || 'USD'} ${dispute.transaction.temporary_credit_amount || 0}` },
              { label: "Status", value: "Closed - Merchant won" }
            ]
          }
        });
      }
    }

    // Sort steps chronologically by timestamp
    steps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return steps;
  };

  const activitySteps = getActivitySteps();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Representment Panel - Full Width if pending */}
      {dispute.chargeback_representment_static && dispute.transaction?.id && (
        <div className="lg:col-span-3">
          <RepresentmentPanel
            transactionId={dispute.transaction.id}
            representmentStatus={dispute.chargeback_representment_static.representment_status}
            merchantReason={dispute.chargeback_representment_static.merchant_reason_text}
            merchantDocumentUrl={dispute.chargeback_representment_static.merchant_document_url}
            temporaryCreditProvided={dispute.transaction.temporary_credit_provided}
            transactionDisputeStatus={dispute.transaction.dispute_status}
            onActionComplete={handleRepresentmentActionComplete}
          />
        </div>
      )}

      {/* Activity Log */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">
                  Tid {dispute.transaction?.transaction_id}
                </div>
                <CardTitle className="flex items-center gap-2">
                  <span className={dispute.status === "under_review" ? "text-blue-600" : ""}>
                    {dispute.status === "under_review" ? "In progress" : "Processing"}
                  </span>
                </CardTitle>
              </div>
            </div>
            {evidenceRequest?.status === 'submitted' && (
              <Alert className="mt-3">
                <AlertTitle>Documents uploaded successfully</AlertTitle>
                <AlertDescription>
                  We are now reviewing your case and will get back to you shortly.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {activitySteps.map((step, index) => (
                <div key={index}>
                  {index > 0 && (
                    <div className="ml-3 h-6 w-0.5 bg-border" />
                  )}
                   <div className={`flex gap-4 ${
                     step.color === 'yellow' ? 'border-l-4 border-yellow-500 pl-3' : 
                     step.color === 'blue' ? 'border-l-4 border-blue-500 pl-3' : 
                     step.color === 'green' ? 'border-l-4 border-green-500 pl-3' : ''
                   }`}>
                     <div className="flex-shrink-0 mt-1">
                       {step.completed ? (
                         <CheckCircle2 className="h-5 w-5 text-primary" />
                       ) : (
                         <Circle className="h-5 w-5 text-muted-foreground" />
                       )}
                     </div>
                     <div className="flex-1 pb-4">
                       <div className="flex items-start justify-between gap-4">
                         <div className="flex-1 min-w-0">
                           <div className="font-medium text-sm">{step.label}</div>
                           
                           {step.hasDetails && step.details ? (
                             <Collapsible open={openSections[index]} onOpenChange={() => toggleSection(index)}>
                               <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground mt-1 hover:text-foreground transition-colors">
                                 {step.description}
                                 <ChevronDown className={`h-3 w-3 transition-transform ${openSections[index] ? 'rotate-180' : ''}`} />
                               </CollapsibleTrigger>
                               <CollapsibleContent>
                                 <div className={`mt-3 space-y-2 rounded-md p-3 ${
                                   step.color === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-950/20' : 
                                   step.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/20' : 
                                   step.color === 'green' ? 'bg-green-50 dark:bg-green-950/20' : 
                                   'bg-muted/30'
                                 }`}>
                                   {step.details.items.map((item, itemIndex) => (
                                     <div key={itemIndex} className="flex items-start gap-2 text-xs">
                                       {item.icon && <span>{item.icon}</span>}
                                       <div className="flex-1">
                                         <span className="text-muted-foreground">
                                           {item.label}
                                           {item.value && `: ${item.value}`}
                                         </span>
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               </CollapsibleContent>
                             </Collapsible>
                           ) : (
                             <div className="text-sm text-muted-foreground mt-1">
                               {step.description}
                             </div>
                           )}
                         </div>
                         <div className="text-xs text-muted-foreground whitespace-nowrap">
                           {format(new Date(step.timestamp), "h:mm a")}
                         </div>
                       </div>
                     </div>
                   </div>
                </div>
              ))}
            </div>

            {dispute.status === "under_review" && (
              <>
                <Separator className="my-6" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
                  <span>Today</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Key Details Sidebar */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Transaction
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tid</span>
                  <span className="font-medium">{dispute.transaction?.transaction_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction Date</span>
                  <span className="font-medium">
                    {dispute.transaction?.transaction_time
                      ? format(new Date(dispute.transaction.transaction_time), "yyyy-MM-dd HH:mm:ss")
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">
                    {dispute.transaction?.transaction_currency}{" "}
                    {dispute.transaction?.transaction_amount?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Merchant Name</span>
                  <span className="font-medium">{dispute.transaction?.merchant_name}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">
                Artifacts
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-4 w-4 border rounded flex items-center justify-center text-xs">
                    📄
                  </div>
                  <span>Disputed transaction</span>
                </div>
                {disputeDocuments.length > 0 && (
                  <div className="flex items-center gap-2">
                    <ArtifactsViewer 
                      documents={disputeDocuments} 
                      title="View Submitted Documents"
                      onPreviewDocument={(url, extractedFields) => {
                        setPreviewContent({ url, extractedFields });
                        setPreviewPaneOpen(true);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {dispute.order_details && (
              <>
                <Separator />
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Order Details
                  </div>
                  <div className="text-sm bg-muted/30 p-3 rounded-md">
                    {dispute.order_details}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Preview Pane */}
      <PreviewPane 
        isOpen={previewPaneOpen}
        onClose={() => setPreviewPaneOpen(false)}
        type="document"
        documentUrl={previewContent?.url}
        extractedFields={previewContent?.extractedFields}
        title="Document Preview"
      />
    </div>
  );
};

export default DisputeDetail;
