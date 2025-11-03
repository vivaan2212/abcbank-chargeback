import { formatDistanceToNow } from "date-fns";
import { UploadedDocument } from "./DocumentUpload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Eye } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import paceAvatar from "@/assets/pace-avatar.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  documents?: UploadedDocument[];
}

const ChatMessage = ({ role, content, timestamp, documents }: ChatMessageProps) => {
  const isAssistant = role === "assistant";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{ url: string; name: string; type: string } | null>(null);

  const previews = useMemo(() => {
    if (!documents) return [];
    return documents.map((d) => ({
      requirementName: d.requirementName,
      file: d.file,
      url: URL.createObjectURL(d.file),
      isImage: /^image\//.test(d.file.type),
      isPdf: d.file.type === 'application/pdf',
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

  const renderContent = (text: string) => {
    // Split by bold markdown syntax **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const handlePreview = (preview: typeof previews[0]) => {
    setSelectedPreview({
      url: preview.url,
      name: preview.file.name,
      type: preview.file.type
    });
    setPreviewOpen(true);
  };

  return (
    <>
      <div className={`flex ${isAssistant ? "justify-start" : "justify-end"} mb-4 animate-fade-in`}>
        <div className={`max-w-[70%] ${isAssistant ? "items-start" : "items-end"} flex flex-col`}>
          {isAssistant && (
            <div className="flex items-center gap-2 mb-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={paceAvatar} alt="Pace" className="object-contain" />
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">Pace</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">Pace</span>
            </div>
          )}
          
          <div
            className={`rounded-2xl px-4 py-3 ${
              isAssistant
                ? "bg-[hsl(var(--chat-assistant-bg))] text-foreground rounded-tl-none"
                : "bg-[hsl(var(--chat-user-bg))] text-[hsl(var(--chat-user-fg))] rounded-tr-none"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{renderContent(content)}</p>
            
            {documents && documents.length > 0 && (
              <div className="mt-3 space-y-2">
                {previews.map((p, idx) => (
                  <Card key={idx} className="p-3 flex items-center gap-3 bg-background/50">
                    <div className="shrink-0 w-12 h-12 bg-muted rounded flex items-center justify-center">
                      {p.isImage ? (
                        <img src={p.url} alt={p.file.name} className="w-full h-full object-cover rounded" />
                      ) : (
                        <FileText className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">{p.requirementName}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(p.file.size)}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handlePreview(p)}
                      className="shrink-0"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDownload(p.file, p.url)}
                      className="shrink-0"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
          <span className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Document Preview Dialog */}
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
                    onClick={() => handleDownload(
                      previews.find(p => p.url === selectedPreview.url)?.file!,
                      selectedPreview.url
                    )}
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

export default ChatMessage;
