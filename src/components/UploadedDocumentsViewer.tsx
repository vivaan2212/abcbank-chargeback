import { useEffect, useState } from "react";
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

  // Local preview state (opens a modal preview directly from the eye button)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{ url: string; name: string; type: string } | null>(null);

  const inferTypeFromName = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
      case 'webp':
      case 'gif':
      case 'jpeg':
      case 'jpg':
        return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  };

  useEffect(() => {
    if (!previewOpen && selectedPreview?.url) {
      URL.revokeObjectURL(selectedPreview.url);
      setSelectedPreview(null);
    }
  }, [previewOpen]);

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

  const openLocalPreview = (doc: UploadedDocument) => {
    const url = URL.createObjectURL(doc.file);
    const type = doc.file.type || inferTypeFromName(doc.file.name);
    setSelectedPreview({ url, name: doc.file.name, type });
    setPreviewOpen(true);
  };

  const handlePreview = (doc: UploadedDocument) => {
    if (onPreviewDocument) {
      const url = URL.createObjectURL(doc.file);
      const extractedFields = [
        { label: 'Document Type', value: doc.requirementName },
        { label: 'File Name', value: doc.file.name },
        { label: 'File Size', value: formatFileSize(doc.file.size) },
        { label: 'File Type', value: doc.file.type || inferTypeFromName(doc.file.name) }
      ];
      onPreviewDocument(url, extractedFields);
    } else {
      openLocalPreview(doc);
    }
  };

  return (
    <>
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
                        title="Preview"
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
                        title="Download"
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

      {/* Inline preview modal opened by the eye button */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPreview?.name}</DialogTitle>
          </DialogHeader>
          {selectedPreview && (
            <div className="mt-4">
              {selectedPreview.type.startsWith('image/') ? (
                <img
                  src={selectedPreview.url}
                  alt={selectedPreview.name}
                  className="w-full h-auto rounded"
                />
              ) : selectedPreview.type === 'application/pdf' ? (
                <iframe
                  src={selectedPreview.url}
                  className="w-full h-[70vh] rounded"
                  title={selectedPreview.name}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-16 h-16 mx-auto mb-4" />
                  <p>Preview not available for this file type</p>
                  <Button
                    onClick={() => {
                      // Fallback: trigger download
                      const a = document.createElement('a');
                      a.href = selectedPreview.url;
                      a.download = selectedPreview.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="mt-4"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
