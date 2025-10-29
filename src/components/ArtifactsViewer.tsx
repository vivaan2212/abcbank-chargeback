import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ArtifactDoc {
  requirementName: string;
  name: string;
  size: number;
  type: string;
  path: string; // storage path in bucket
}

interface ArtifactsViewerProps {
  title?: string;
  bucket?: string; // default: dispute-documents
  documents: ArtifactDoc[];
}

export const ArtifactsViewer = ({ title = "View Artifacts", bucket = "dispute-documents", documents }: ArtifactsViewerProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);

  const hasDocs = documents && documents.length > 0;
  if (!hasDocs) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const createSigned = async (path: string, expiresIn = 60 * 60) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  };

  const handlePreview = async (doc: ArtifactDoc) => {
    try {
      const url = await createSigned(doc.path, 60 * 10);
      setPreviewType(doc.type);
      setPreviewUrl(url);
    } catch (e) {
      console.error("Preview error", e);
    }
  };

  const handleDownload = async (doc: ArtifactDoc) => {
    try {
      const url = await createSigned(doc.path, 60 * 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error", e);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          {title} ({documents.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Artifacts</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-3">
            {documents.map((doc, idx) => (
              <Card key={idx} className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1 truncate">{doc.requirementName}</p>
                  <p className="text-sm text-muted-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatFileSize(doc.size)} • {doc.type || "Unknown type"}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handlePreview(doc)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>

        {/* Inline Preview */}
        {previewUrl && (
          <div className="mt-4">
            {previewType?.startsWith("image/") ? (
              <img src={previewUrl} alt="Preview" className="max-h-[60vh] w-full object-contain rounded" />
            ) : previewType === "application/pdf" ? (
              <iframe src={previewUrl} className="w-full h-[60vh] rounded" />
            ) : (
              <div className="text-sm text-muted-foreground">Preview not supported for this file type. Use Download instead.</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArtifactsViewer;
