import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CustomerEvidenceUploadProps {
  transactionId: string;
  onComplete?: () => void;
}

export const CustomerEvidenceUpload = ({
  transactionId,
  onComplete,
}: CustomerEvidenceUploadProps) => {
  const [customerNote, setCustomerNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleSubmit = async () => {
    if (!customerNote.trim() && files.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please provide either a description or upload files.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare file information for AI evaluation
      const evidenceFiles = files.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
      }));

      // Call evaluation function
      const { data, error } = await supabase.functions.invoke(
        "evaluate-customer-evidence",
        {
          body: {
            transaction_id: transactionId,
            customer_note: customerNote,
            evidence_files: evidenceFiles,
          },
        }
      );

      if (error) throw error;

      toast({
        title: "Evidence Submitted",
        description: "Your evidence has been submitted and is being reviewed.",
      });

      onComplete?.();
    } catch (error: any) {
      console.error("Error submitting evidence:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit evidence",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <FileText className="h-5 w-5" />
          Upload Your Evidence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-blue-600 dark:text-blue-300 space-y-2">
          <p>
            The merchant has challenged your dispute. To continue, please
            provide:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              Communication with the merchant (emails, chats, screenshots)
            </li>
            <li>Delivery proofs or refund requests</li>
            <li>Ticket numbers or support responses</li>
          </ul>
          <p className="text-xs mt-2">
            Allowed files: PDF, JPG, PNG, DOCX (max 5MB each)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-note">
            Describe what happened with the merchant:
          </Label>
          <Textarea
            id="customer-note"
            placeholder="e.g., 'Merchant refused refund on Oct 10' or 'Never received the product despite multiple emails'"
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            rows={4}
            className="bg-white dark:bg-gray-900"
          />
        </div>

        <div className="space-y-2">
          <Label>Upload Supporting Documents:</Label>
          <div className="border-2 border-dashed rounded-lg p-4 bg-white dark:bg-gray-900">
            <input
              type="file"
              id="evidence-files"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="evidence-files"
              className="flex flex-col items-center gap-2 cursor-pointer"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </span>
            </label>
          </div>
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="text-xs text-muted-foreground flex items-center gap-2"
                >
                  <FileText className="h-3 w-3" />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Evidence"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};