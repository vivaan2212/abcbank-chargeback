-- Create chargeback_videos table
CREATE TABLE public.chargeback_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_network TEXT NOT NULL CHECK (card_network IN ('Visa', 'Mastercard')),
  video_path TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  file_size_mb NUMERIC NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS on chargeback_videos
ALTER TABLE public.chargeback_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can view videos
CREATE POLICY "Authenticated users can view videos"
ON public.chargeback_videos
FOR SELECT
USING (auth.role() = 'authenticated');

-- RLS Policy: Bank admins can manage videos
CREATE POLICY "Bank admins can manage videos"
ON public.chargeback_videos
FOR ALL
USING (has_role(auth.uid(), 'bank_admin'::app_role));

-- Add video_id to chargeback_actions
ALTER TABLE public.chargeback_actions
ADD COLUMN video_id UUID REFERENCES public.chargeback_videos(id);

-- Create storage bucket for chargeback videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('chargeback-videos', 'chargeback-videos', false);

-- RLS Policy: Authenticated users can read videos from storage
CREATE POLICY "Authenticated users can read chargeback videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chargeback-videos' AND auth.role() = 'authenticated');

-- RLS Policy: Bank admins can upload/update videos
CREATE POLICY "Bank admins can upload chargeback videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'chargeback-videos' AND has_role(auth.uid(), 'bank_admin'::app_role));

CREATE POLICY "Bank admins can update chargeback videos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'chargeback-videos' AND has_role(auth.uid(), 'bank_admin'::app_role));

-- Insert initial video records (placeholder paths - you'll upload actual videos)
INSERT INTO public.chargeback_videos (card_network, video_path, duration_seconds, file_size_mb, is_active)
VALUES 
  ('Visa', 'visa-chargeback.mp4', 450, 8.5, true),
  ('Mastercard', 'mastercard-chargeback.mp4', 450, 8.5, true);