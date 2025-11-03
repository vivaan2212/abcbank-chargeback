import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Play, Pause, Volume2, VolumeX, Maximize, Download, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ExtractedField {
  label: string;
  value: string;
}

interface PreviewPaneProps {
  isOpen: boolean;
  onClose: () => void;
  type: "video" | "document" | null;
  videoUrl?: string | null;
  cardNetwork?: string | null;
  documentUrl?: string | null;
  extractedFields?: ExtractedField[];
  title?: string;
}

export const PreviewPane = ({
  isOpen,
  onClose,
  type,
  videoUrl,
  cardNetwork,
  documentUrl,
  extractedFields = [],
  title = "Preview"
}: PreviewPaneProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset video state when pane closes
      setIsPlaying(false);
      setCurrentTime(0);
      setError(null);
    }
  }, [isOpen]);

  // Fetch document as blob to ensure inline rendering in iframe
  useEffect(() => {
    if (!isOpen || type !== 'document' || !documentUrl) return;
    setIsLoading(true);
    setError(null);
    let createdUrl: string | null = null;
    const resolved = getResolvedDocumentUrl(documentUrl)!;

    fetch(resolved)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch document');
        return res.blob();
      })
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        // Check if it's an image
        if (blob.type.startsWith('image/')) {
          setImageUrl(createdUrl);
        } else {
          setDocBlobUrl(createdUrl);
        }
        setIsLoading(false);
      })
      .catch((e) => {
        console.error('Document fetch error:', e);
        setError('Failed to load document. Please try again.');
        setIsLoading(false);
      });

    return () => {
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setDocBlobUrl(null);
      setImageUrl(null);
    };
  }, [isOpen, type, documentUrl]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      setIsMuted(vol === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleError = () => {
    setError("Failed to load video. Please try again.");
    setIsLoading(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getResolvedDocumentUrl = (url?: string | null) => {
    if (!url) return null;
    return url.startsWith('/')
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${url}`
      : url;
  };

  const handleDownloadDocument = async () => {
    if (!documentUrl) return;
    
    try {
      const link = document.createElement('a');
      const href = getResolvedDocumentUrl(documentUrl) as string;
      link.href = href;
      link.download = 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="h-full w-full bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-3">
          {type === "document" && extractedFields.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              className="mr-2"
            >
              {isDetailsOpen ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
              Details
            </Button>
          )}
          <h2 className="text-lg font-semibold">{title}</h2>
          {cardNetwork && (
            <span className="text-sm text-muted-foreground">({cardNetwork})</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {type === "video" && videoUrl && (
          <div className="h-full flex flex-col bg-black">
            <div className="flex-1 flex items-center justify-center relative">
              {error ? (
                <div className="text-white text-center p-8">
                  <p className="mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()}>Reload</Button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onError={handleError}
                    onClick={togglePlay}
                  />
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-white">Loading video...</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Video Controls */}
            {!error && (
              <div className="bg-gray-900 p-4 space-y-2">
                {/* Progress Bar */}
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={togglePlay}
                      className="text-white hover:bg-white/10"
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    
                    <span className="text-white text-sm">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleMute}
                        className="text-white hover:bg-white/10"
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="h-5 w-5" />
                        ) : (
                          <Volume2 className="h-5 w-5" />
                        )}
                      </Button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFullscreen}
                    className="text-white hover:bg-white/10"
                  >
                    <Maximize className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {type === "document" && documentUrl && (
          <div className="h-full flex">
            {/* Left: Extracted Fields - Only show when open */}
            {extractedFields.length > 0 && isDetailsOpen && (
              <div className="w-[35%] border-r border-border bg-muted/20">
                <ScrollArea className="h-full">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Extracted Details
                      </h3>
                      <Button variant="ghost" size="sm" onClick={handleDownloadDocument}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-1">
                      {extractedFields.map((field, idx) => (
                        <Card key={idx} className="p-4 bg-background">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {field.label}
                            </p>
                            <p className="text-sm font-medium text-foreground break-all">
                              {field.value}
                            </p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Right: Document/Image Viewer */}
            <div className="flex-1 bg-gray-100 relative">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="text-muted-foreground">Loading document...</div>
                </div>
              )}
              {imageUrl ? (
                <div className="w-full h-full flex items-center justify-center bg-background p-4 overflow-auto">
                  <img
                    src={imageUrl}
                    alt={title}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  src={docBlobUrl || (getResolvedDocumentUrl(documentUrl) || undefined)}
                  className="w-full h-full"
                  title="Document Preview"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
