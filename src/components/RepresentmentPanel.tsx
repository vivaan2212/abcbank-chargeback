import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, FileText, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RepresentmentPanelProps {
  transactionId: string;
  representmentStatus: string;
  merchantReason?: string;
  merchantDocumentUrl?: string;
  temporaryCreditProvided?: boolean;
  onActionComplete?: () => void;
}

export const RepresentmentPanel = ({
  transactionId,
  representmentStatus,
  merchantReason,
  merchantDocumentUrl,
  temporaryCreditProvided,
  onActionComplete,
}: RepresentmentPanelProps) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [customerEvidence, setCustomerEvidence] = useState<any>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { toast } = useToast();

  const handleAcceptRepresentment = async () => {
    setIsAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-representment', {
        body: {
          transaction_id: transactionId,
          admin_notes: adminNotes || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Representment Accepted",
        description: data.credit_reversed
          ? "Merchant wins. Temporary credit has been reversed."
          : "Merchant wins. Case closed.",
      });

      onActionComplete?.();
    } catch (error: any) {
      console.error('Error accepting representment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept representment",
        variant: "destructive",
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRejectRepresentment = async () => {
    setIsRejecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reject-representment', {
        body: {
          transaction_id: transactionId,
          admin_notes: adminNotes || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Representment Rejected",
        description: "Customer has been notified and asked for additional evidence.",
      });

      onActionComplete?.();
    } catch (error: any) {
      console.error('Error rejecting representment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject representment",
        variant: "destructive",
      });
    } finally {
      setIsRejecting(false);
    }
  };

  // State: Merchant did not represent
  if (representmentStatus === 'no_representment') {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            Merchant Did Not Represent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600 dark:text-green-300 mb-2">
            The merchant has not contested this chargeback or has accepted it.
          </p>
          {temporaryCreditProvided && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Temporary credit has become permanent. Customer wins.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // Load customer evidence when in awaiting_customer_info state
  useEffect(() => {
    if (representmentStatus === 'awaiting_customer_info') {
      loadCustomerEvidence();
    }
  }, [representmentStatus, transactionId]);

  const loadCustomerEvidence = async () => {
    setLoadingEvidence(true);
    try {
      const { data, error } = await supabase
        .from('dispute_customer_evidence')
        .select('*')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setCustomerEvidence(data);
    } catch (error) {
      console.error('Error loading customer evidence:', error);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleProceedToPrearbitration = async () => {
    setIsProceeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('proceed-to-prearbitration', {
        body: {
          transaction_id: transactionId,
          admin_notes: adminNotes || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Pre-Arbitration Filed",
        description: `Successfully filed with ${data.network}. You'll receive updates once the network responds.`,
      });

      onActionComplete?.();
    } catch (error: any) {
      console.error('Error filing pre-arbitration:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to file pre-arbitration",
        variant: "destructive",
      });
    } finally {
      setIsProceeding(false);
    }
  };

  const handleCloseCase = async () => {
    setIsClosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('close-after-customer-evidence', {
        body: {
          transaction_id: transactionId,
          admin_notes: adminNotes || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Case Closed",
        description: data.credit_reversed
          ? "Merchant wins. Temporary credit has been reversed."
          : "Merchant wins. Case closed.",
      });

      onActionComplete?.();
    } catch (error: any) {
      console.error('Error closing case:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to close case",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  // State: Awaiting customer info - Check if evidence has been submitted
  if (representmentStatus === 'awaiting_customer_info') {
    // If no evidence yet, show waiting state
    if (loadingEvidence) {
      return (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Clock className="h-5 w-5" />
              Awaiting Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              Loading customer evidence...
            </p>
          </CardContent>
        </Card>
      );
    }

    if (!customerEvidence) {
      return (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Clock className="h-5 w-5" />
              Awaiting Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              We've asked the customer to provide more communication or proof with the merchant. 
              This case will reopen when the customer responds.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Customer has submitted evidence - show AI evaluation and decision options
    const isAISufficient = customerEvidence.ai_sufficient;
    
    return (
      <Card className={cn(
        "border-2",
        isAISufficient 
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
          : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950"
      )}>
        <CardHeader>
          <CardTitle className={cn(
            "flex items-center gap-2",
            isAISufficient 
              ? "text-green-700 dark:text-green-400"
              : "text-orange-700 dark:text-orange-400"
          )}>
            {isAISufficient ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            Customer Evidence Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className={isAISufficient ? "border-green-300" : "border-orange-300"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {isAISufficient 
                ? "Customer evidence has been reviewed. AI found it relevant and complete."
                : "Customer documents do not appear relevant or complete. You may proceed anyway or close the case."
              }
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="font-semibold">AI Evaluation Summary:</Label>
            <p className="text-sm p-3 bg-background rounded-md border">
              {customerEvidence.ai_summary || "No summary available"}
            </p>
          </div>

          {customerEvidence.ai_reasons && customerEvidence.ai_reasons.length > 0 && (
            <div className="space-y-2">
              <Label className="font-semibold">Evaluation Criteria:</Label>
              <ul className="text-sm space-y-1 list-disc list-inside p-3 bg-background rounded-md border">
                {customerEvidence.ai_reasons.map((reason: string, index: number) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {customerEvidence.customer_note && (
            <div className="space-y-2">
              <Label className="font-semibold">Customer's Explanation:</Label>
              <p className="text-sm p-3 bg-background rounded-md border">
                {customerEvidence.customer_note}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="admin-notes-evidence">Admin Notes (Optional):</Label>
            <Textarea
              id="admin-notes-evidence"
              placeholder="Add internal notes about this decision..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="default"
              className="flex-1"
              onClick={handleProceedToPrearbitration}
              disabled={isProceeding || isClosing}
            >
              {isProceeding ? "Processing..." : "✓ Yes, Proceed to Pre-Arbitration"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleCloseCase}
              disabled={isProceeding || isClosing}
            >
              {isClosing ? "Processing..." : "✗ No, Close Case"}
            </Button>
          </div>

          {temporaryCreditProvided && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Note: Temporary credit was provided. Closing the case will reverse this credit.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // State: Accepted by bank (merchant wins)
  if (representmentStatus === 'accepted_by_bank') {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            Representment Accepted - Merchant Wins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-300 mb-2">
            Bank has accepted the merchant's representment.
          </p>
          {temporaryCreditProvided && (
            <Alert className="mt-4" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Temporary credit has been reversed.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // State: Pending - Bank must decide
  if (representmentStatus === 'pending') {
    return (
      <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <AlertCircle className="h-5 w-5" />
            Merchant Representment - Action Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The merchant has contested this chargeback. Review the evidence and decide.
            </AlertDescription>
          </Alert>

          {merchantReason && (
            <div className="space-y-2">
              <Label className="font-semibold">Merchant's Reason:</Label>
              <p className="text-sm p-3 bg-background rounded-md border">
                {merchantReason}
              </p>
            </div>
          )}

          {merchantDocumentUrl && (
            <div className="space-y-2">
              <Label className="font-semibold">Merchant's Evidence:</Label>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(merchantDocumentUrl, '_blank')}
              >
                <FileText className="h-4 w-4" />
                View Document
              </Button>
            </div>
          )}

          {!merchantDocumentUrl && !merchantReason && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Warning: Merchant evidence is missing or incomplete.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="admin-notes">Admin Notes (Optional):</Label>
            <Textarea
              id="admin-notes"
              placeholder="Add internal notes about this decision..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleAcceptRepresentment}
              disabled={isAccepting || isRejecting}
            >
              {isAccepting ? "Processing..." : "Accept Representment"}
              <span className="text-xs block mt-1">(Merchant Wins)</span>
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={handleRejectRepresentment}
              disabled={isAccepting || isRejecting}
            >
              {isRejecting ? "Processing..." : "Reject Representment"}
              <span className="text-xs block mt-1">(Ask Customer for More Info)</span>
            </Button>
          </div>

          {temporaryCreditProvided && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Note: Temporary credit was provided. Accepting representment will reverse this credit.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
};
