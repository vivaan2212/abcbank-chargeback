import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { Upload, FileCheck, X } from "lucide-react";
import { toast } from "sonner";

export interface DocumentRequirement {
  name: string;
  uploadType: string[];
}

interface AIClassification {
  category: string;
  categoryLabel: string;
  explanation: string;
  documents: { name: string; uploadTypes: string }[];
  userMessage: string;
}

interface DocumentUploadProps {
  reasonId: string;
  reasonLabel: string;
  customReason?: string;
  aiClassification?: AIClassification | null;
  onComplete: (documents: UploadedDocument[]) => void;
}

export interface UploadedDocument {
  requirementName: string;
  file: File;
}

const DOCUMENT_REQUIREMENTS: Record<string, DocumentRequirement[]> = {
  fraud: [
    { name: "Police report or fraud claim", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Bank statement showing unauthorized charge(s)", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Transaction receipt or email confirmation", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
  ],
  not_received: [
    { name: "Order confirmation or invoice", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Shipping tracking number or delivery receipt", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Correspondence (e.g., emails) showing failure to deliver", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
  ],
  duplicate: [
    { name: "Bank statement showing duplicate charges", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Transaction receipt or invoice", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Merchant correspondence proving duplicate charges", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
  ],
  incorrect_amount: [
    { name: "Transaction receipt showing agreed price", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Bank statement showing incorrect charge", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Email correspondence with merchant regarding pricing discrepancy", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
  ],
  other: [
    { name: "Relevant proof (e.g., any supporting document)", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Bank statement showing the charge", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
    { name: "Any other correspondence (e.g., emails, messages)", uploadType: ["pdf", "docx", "txt", "png", "jpg"] },
  ],
};

export const DocumentUpload = ({ reasonId, reasonLabel, customReason, aiClassification, onComplete }: DocumentUploadProps) => {
  // Use AI-provided requirements if available, otherwise use predefined
  const aiRequirements: DocumentRequirement[] | null = aiClassification?.documents?.map(doc => ({
    name: doc.name,
    uploadType: doc.uploadTypes.split(',').map(t => t.trim().toLowerCase())
  })) || null;
  
  const requirements = aiRequirements || DOCUMENT_REQUIREMENTS[reasonId] || DOCUMENT_REQUIREMENTS.other;
  const [uploadedDocs, setUploadedDocs] = useState<Map<string, File>>(new Map());

  const handleFileChange = (requirementName: string, file: File | null) => {
    if (!file) {
      const newDocs = new Map(uploadedDocs);
      newDocs.delete(requirementName);
      setUploadedDocs(newDocs);
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("File size must be less than 10MB");
      return;
    }

    const newDocs = new Map(uploadedDocs);
    newDocs.set(requirementName, file);
    setUploadedDocs(newDocs);
    toast.success(`${file.name} uploaded successfully`);
  };

  const handleSubmit = () => {
    if (uploadedDocs.size !== requirements.length) {
      toast.error("Please upload all required documents");
      return;
    }

    const documents: UploadedDocument[] = Array.from(uploadedDocs.entries()).map(
      ([requirementName, file]) => ({
        requirementName,
        file,
      })
    );

    onComplete(documents);
  };

  const allDocsUploaded = uploadedDocs.size === requirements.length;

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          {aiClassification ? aiClassification.categoryLabel : (customReason ? "Other - Custom Reason" : reasonLabel)}
        </h3>
        {customReason && (
          <p className="text-sm text-muted-foreground mt-1">"{customReason}"</p>
        )}
        {aiClassification && (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <p className="text-sm font-medium mb-1">Pace Analysis:</p>
            <p className="text-sm text-muted-foreground">{aiClassification.explanation}</p>
          </div>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground">
        Please upload the following documents (PDF, Word, .txt, PNG, or JPG format):
      </p>

      <div className="space-y-4">
        {requirements.map((req, index) => {
          const uploadedFile = uploadedDocs.get(req.name);
          
          return (
            <div key={index} className="border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">{index + 1}. {req.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Accepted: {req.uploadType.map(t => t.toUpperCase()).join(", ")}
                  </p>
                </div>
                {uploadedFile && (
                  <FileCheck className="w-5 h-5 text-green-600" />
                )}
              </div>

              {uploadedFile ? (
                <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                  <span className="text-sm truncate flex-1">{uploadedFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFileChange(req.name, null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    id={`file-${index}`}
                    className="hidden"
                    accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(req.name, file);
                    }}
                  />
                  <label htmlFor={`file-${index}`}>
                    <Button
                      variant="outline"
                      className="w-full"
                      asChild
                    >
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Document
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!allDocsUploaded}
        className="w-full"
      >
        Submit Documents ({uploadedDocs.size}/{requirements.length})
      </Button>
    </Card>
  );
};
