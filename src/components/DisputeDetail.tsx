import { format } from "date-fns";
import { CheckCircle2, Circle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RepresentmentView } from "./RepresentmentView";

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
  const [representment, setRepresentment] = useState<any>(null);
  const [isLoadingRepresentment, setIsLoadingRepresentment] = useState(true);

  const toggleSection = (index: number) => {
    setOpenSections(prev => ({ ...prev, [index]: !prev[index] }));
  };

  useEffect(() => {
    const fetchRepresentment = async () => {
      if (!dispute.transaction?.id) {
        setIsLoadingRepresentment(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('merchant_representments')
          .select('*')
          .eq('transaction_id', dispute.transaction.id)
          .eq('has_representment', true)
          .order('representment_created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error fetching representment:', error);
        } else if (data) {
          setRepresentment(data);
        }
      } catch (error) {
        console.error('Error fetching representment:', error);
      } finally {
        setIsLoadingRepresentment(false);
      }
    };

    fetchRepresentment();
  }, [dispute.transaction?.id]);

  const handleRepresentmentActionComplete = () => {
    setRepresentment(null);
    if (onUpdate) {
      onUpdate();
    }
  };

  const getActivitySteps = () => {
    const steps: Array<{
      label: string;
      description: string;
      completed: boolean;
      timestamp: string;
      hasDetails: boolean;
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

    return steps;
  };

  const activitySteps = getActivitySteps();

  // If there's a representment and transaction needs attention, show RepresentmentView
  if (!isLoadingRepresentment && representment && dispute.transaction?.needs_attention) {
    return (
      <div className="space-y-6">
        <RepresentmentView
          transactionId={dispute.transaction.id!}
          representment={representment}
          temporaryCredit={{
            provided: dispute.transaction.temporary_credit_provided || false,
            amount: dispute.transaction.temporary_credit_amount || 0,
            currency: dispute.transaction.temporary_credit_currency || 'USD'
          }}
          onActionComplete={handleRepresentmentActionComplete}
        />
        
        {/* Show original dispute details below */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Original Dispute Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{dispute.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span className="font-medium">{dispute.reason_label || 'N/A'}</span>
              </div>
              {dispute.custom_reason && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custom Reason</span>
                  <span className="font-medium">{dispute.custom_reason}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {activitySteps.map((step, index) => (
                <div key={index}>
                  {index > 0 && (
                    <div className="ml-3 h-6 w-0.5 bg-border" />
                  )}
                  <div className="flex gap-4">
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
                                <div className="mt-3 space-y-2 bg-muted/30 rounded-md p-3">
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
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Artifacts
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-4 w-4 border rounded flex items-center justify-center text-xs">
                    📄
                  </div>
                  <span>Disputed transaction</span>
                </div>
                {dispute.documents && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-4 w-4 border rounded flex items-center justify-center text-xs">
                      📎
                    </div>
                    <span>Supporting documents</span>
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
    </div>
  );
};

export default DisputeDetail;
