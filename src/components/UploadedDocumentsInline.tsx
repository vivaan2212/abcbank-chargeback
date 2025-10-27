import React, { useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadedDocument } from "./DocumentUpload";
import { Download, FileText, Image as ImageIcon } from "lucide-react";

interface UploadedDocumentsInlineProps {
  documents: UploadedDocument[];
}

export const UploadedDocumentsInline: React.FC<UploadedDocumentsInlineProps> = ({ documents }) => {
  const previews = useMemo(() => {
    return documents.map((d) => ({
      requirementName: d.requirementName,
      file: d.file,
      url: URL.createObjectURL(d.file),
      isImage: /^image\//.test(d.file.type),
      isPdf: d.file.type === "application/pdf" || d.file.name.toLowerCase().endsWith(".pdf"),
    }));
  }, [documents]);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const handleDownload = (file: File, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (!documents.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {previews.map((p, idx) => (
        <Card key={idx} className="p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors">
          <div className="shrink-0 w-12 h-12 bg-muted rounded flex items-center justify-center">
            {p.isImage ? (
              <img src={p.url} alt={p.file.name} className="w-full h-full object-cover rounded" />
            ) : (
              <FileText className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.requirementName}</p>
            <p className="text-xs text-muted-foreground truncate">{p.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(p.file.size)}</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleDownload(p.file, p.url)}
            className="shrink-0"
          >
            <Download className="w-4 h-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
};
