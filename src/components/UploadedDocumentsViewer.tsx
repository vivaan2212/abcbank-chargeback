import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye } from "lucide-react";
import { UploadedDocument } from "./DocumentUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface UploadedDocumentsViewerProps {
  documents: UploadedDocument[];
  onPreviewDocument?: (url: string, extractedFields: Array<{ label: string; value: string }>) => void;
}

export const UploadedDocumentsViewer = ({ documents, onPreviewDocument }: UploadedDocumentsViewerProps) => {
  if (documents.length === 0) return null;

  const handleDownload = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handlePreview = (doc: UploadedDocument) => {
    if (onPreviewDocument) {
      const url = URL.createObjectURL(doc.file);
      const extractedFields = [
        { label: "Document Type", value: doc.requirementName },
        { label: "File Name", value: doc.file.name },
        { label: "File Size", value: formatFileSize(doc.file.size) },
        { label: "File Type", value: doc.file.type || "Unknown" }
      ];
      onPreviewDocument(url, extractedFields);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          View Uploaded Documents ({documents.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Uploaded Documents</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-4">
            {documents.map((doc, index) => (
              <Card 
                key={index} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handlePreview(doc)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {doc.requirementName}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {doc.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatFileSize(doc.file.size)} • {doc.file.type || 'Unknown type'}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(doc);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(doc.file);
                      }}
                      className="shrink-0"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
