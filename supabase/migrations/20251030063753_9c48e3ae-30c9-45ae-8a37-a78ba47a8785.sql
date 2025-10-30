-- Temporarily allow authenticated users to upload to chargeback-videos bucket
CREATE POLICY "Temp: Authenticated users can upload videos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chargeback-videos' 
  AND auth.role() = 'authenticated'
);