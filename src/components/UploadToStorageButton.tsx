import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface UploadToStorageButtonProps {
  bucket: string;
  label?: string;
  accept?: string;
  folder?: string; // optional folder prefix inside the bucket
}

// Simple, reusable upload button for Lovable Cloud Storage
export function UploadToStorageButton({
  bucket,
  label = "Upload",
  accept = "*/*",
  folder = "uploads",
}: UploadToStorageButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      const uploads = Array.from(files).map(async (file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });
        if (error) throw error;
        return path;
      });

      const paths = await Promise.all(uploads);
      toast.success(`Uploaded ${paths.length} file${paths.length > 1 ? "s" : ""} to ${bucket}`);
    } catch (err: any) {
      console.error("Upload failed", err);
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-selecting same file
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button size="sm" onClick={handleClick} disabled={uploading}>
        <Upload className="h-4 w-4 mr-2" />
        {uploading ? "Uploading..." : label}
      </Button>
    </>
  );
}
