import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, FileText, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  // State: Awaiting customer info
  if (representmentStatus === 'awaiting_customer_info') {
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
