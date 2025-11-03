import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  onPreviewDocument?: (url: string, extractedFields: Array<{ label: string; value: string }>) => void;
}

export const ArtifactsViewer = ({ 
  title = "View Artifacts", 
  bucket = "dispute-documents", 
  documents,
  onPreviewDocument 
}: ArtifactsViewerProps) => {
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
      // Create extracted fields from document metadata
      const extractedFields = [
        { label: "Document Type", value: doc.requirementName },
        { label: "File Name", value: doc.name },
        { label: "File Size", value: formatFileSize(doc.size) },
        { label: "File Type", value: doc.type || "Unknown" }
      ];
      
      if (onPreviewDocument) {
        onPreviewDocument(url, extractedFields);
      }
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
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">
          {title} ({documents.length})
        </h3>
      </div>
      <ScrollArea className="max-h-[300px]">
        <div className="space-y-2">
          {documents.map((doc, idx) => (
            <Card key={idx} className="p-3 flex items-start justify-between gap-4">
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
    </div>
  );
};

export default ArtifactsViewer;
