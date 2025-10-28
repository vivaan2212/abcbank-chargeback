import { format } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface DisputeDetailProps {
  dispute: {
    id: string;
    status: string;
    eligibility_status: string | null;
    reason_label: string | null;
    custom_reason: string | null;
    documents: any;
    eligibility_reasons: string[] | null;
    created_at: string;
    updated_at: string;
    transaction?: {
      transaction_id: number;
      transaction_time: string;
      transaction_amount: number;
      transaction_currency: string;
      merchant_name: string;
      merchant_category_code: number;
      acquirer_name: string;
    };
  };
}

const DisputeDetail = ({ dispute }: DisputeDetailProps) => {
  const getActivitySteps = () => {
    const steps = [
      {
        label: "Received a disputed transaction",
        description: "Disputed transaction",
        completed: true,
        timestamp: dispute.created_at,
      },
    ];

    if (dispute.transaction) {
      steps.push({
        label: "Transaction selected",
        description: `Selected ${dispute.transaction.merchant_name} transaction`,
        completed: ["transaction_selected", "eligibility_checked", "reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.created_at,
      });
    }

    if (dispute.eligibility_status) {
      steps.push({
        label: dispute.eligibility_status === "ELIGIBLE" ? "Transaction is eligible" : "Transaction is not eligible",
        description: dispute.eligibility_reasons?.join(", ") || "See reasoning",
        completed: ["eligibility_checked", "reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.created_at,
      });
    }

    if (dispute.transaction?.transaction_time) {
      steps.push({
        label: "Transaction is settled",
        description: `Settled on ${format(new Date(dispute.transaction.transaction_time), "dd MMM yyyy")}`,
        completed: true,
        timestamp: dispute.transaction.transaction_time,
      });
    }

    if (dispute.reason_label) {
      steps.push({
        label: "Reason selected",
        description: dispute.reason_label + (dispute.custom_reason ? `: ${dispute.custom_reason}` : ""),
        completed: ["reason_selected", "documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.updated_at,
      });
    }

    if (dispute.documents) {
      steps.push({
        label: "Documents uploaded",
        description: "Supporting documents provided",
        completed: ["documents_uploaded", "under_review"].includes(dispute.status),
        timestamp: dispute.updated_at,
      });
    }

    if (dispute.status === "under_review") {
      steps.push({
        label: "Chargeback filing in progress...",
        description: "Your chargeback is being processed",
        completed: false,
        timestamp: dispute.updated_at,
      });
    }

    return steps;
  };

  const activitySteps = getActivitySteps();

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
            <div className="space-y-6">
              {activitySteps.map((step, index) => (
                <div key={index}>
                  {index > 0 && index < activitySteps.length && (
                    <div className="ml-3 h-8 w-0.5 bg-border" />
                  )}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {step.completed ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium">{step.label}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {step.description}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DisputeDetail;
