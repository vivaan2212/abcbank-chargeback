import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RepresentmentViewProps {
  transactionId: string;
  representment: {
    id: string;
    representment_reason_code: string | null;
    representment_reason_text: string | null;
    representment_document_url: string | null;
    representment_created_at: string;
    representment_source: string | null;
  };
  temporaryCredit: {
    provided: boolean;
    amount: number;
    currency: string | null;
  };
  onActionComplete: () => void;
}

export function RepresentmentView({
  transactionId,
  representment,
  temporaryCredit,
  onActionComplete
}: RepresentmentViewProps) {
  const [isContesting, setIsContesting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [actionType, setActionType] = useState<'contest' | 'accept' | null>(null);

  const handleContest = async () => {
    setIsContesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('contest-representment', {
        body: {
          transaction_id: transactionId,
          notes: notes || 'Contesting merchant representment',
          additional_documents: []
        }
      });

      if (error) throw error;

      toast.success('Representment contested successfully');
      onActionComplete();
    } catch (error) {
      console.error('Error contesting representment:', error);
      toast.error('Failed to contest representment');
    } finally {
      setIsContesting(false);
      setShowNotesInput(false);
      setNotes("");
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-representment', {
        body: {
          transaction_id: transactionId,
          notes: notes || 'Accepting merchant representment'
        }
      });

      if (error) throw error;

      toast.success('Representment accepted successfully');
      if (data.credit_reversal?.reversed) {
        toast.info(`Temporary credit of ${data.credit_reversal.amount} ${data.credit_reversal.currency} has been reversed`);
      }
      onActionComplete();
    } catch (error) {
      console.error('Error accepting representment:', error);
      toast.error('Failed to accept representment');
    } finally {
      setIsAccepting(false);
      setShowNotesInput(false);
      setNotes("");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Needs Attention</AlertTitle>
        <AlertDescription>
          Merchant has responded to this chargeback. Please review and take action.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Merchant's Response</CardTitle>
            <Badge variant="outline">{representment.representment_source || 'Unknown Source'}</Badge>
          </div>
          <CardDescription>
            Received on {formatDate(representment.representment_created_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Reason Code</Label>
            <p className="text-sm text-muted-foreground">
              {representment.representment_reason_code || 'N/A'}
            </p>
          </div>

          <div>
            <Label className="text-sm font-semibold">Reason</Label>
            <p className="text-sm">
              {representment.representment_reason_text || 'No reason provided by merchant'}
            </p>
          </div>

          {representment.representment_document_url ? (
            <div>
              <Label className="text-sm font-semibold">Supporting Document</Label>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => window.open(representment.representment_document_url!, '_blank')}
              >
                <FileText className="h-4 w-4 mr-2" />
                View Document
              </Button>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Merchant document not available
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {temporaryCredit.provided && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Temporary Credit Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              A temporary credit of <span className="font-semibold">
                {temporaryCredit.amount} {temporaryCredit.currency}
              </span> was provided to the customer.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              If you accept the representment, this credit will be automatically reversed.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Decision</CardTitle>
          <CardDescription>
            Review the merchant's evidence and decide how to proceed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showNotesInput ? (
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setActionType('contest');
                  setShowNotesInput(true);
                }}
                disabled={isContesting || isAccepting}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Contest Representment
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setActionType('accept');
                  setShowNotesInput(true);
                }}
                disabled={isContesting || isAccepting}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Accept Representment
                {temporaryCredit.provided && (
                  <span className="ml-2">
                    & Reverse {temporaryCredit.amount} {temporaryCredit.currency}
                  </span>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes about your decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={actionType === 'contest' ? handleContest : handleAccept}
                  disabled={isContesting || isAccepting}
                  variant={actionType === 'contest' ? 'default' : 'destructive'}
                  className="flex-1"
                >
                  {(isContesting || isAccepting) && 'Processing...'}
                  {!isContesting && !isAccepting && (
                    actionType === 'contest' ? 'Confirm Contest' : 'Confirm Accept & Reverse'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNotesInput(false);
                    setActionType(null);
                    setNotes("");
                  }}
                  disabled={isContesting || isAccepting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
