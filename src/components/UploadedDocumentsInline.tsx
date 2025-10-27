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

  if (!documents.length) return null;

  return (
    <div className="mt-6">
      <Card className="p-4">
        <p className="text-sm font-medium mb-3">Uploaded documents</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {previews.map((p, idx) => (
            <Card key={idx} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.requirementName}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.file.name}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(p.file, p.url)}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-3">
                {p.isImage ? (
                  <img src={p.url} alt={p.file.name} className="w-full h-48 object-contain rounded" />
                ) : p.isPdf ? (
                  <iframe title={p.file.name} src={p.url} className="w-full h-48 rounded border border-border" />
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">No inline preview available</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
};
