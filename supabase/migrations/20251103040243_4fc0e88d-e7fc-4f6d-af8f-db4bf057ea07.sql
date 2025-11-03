-- Drop existing policies if they exist to recreate them
drop policy if exists "read_dispute_and_video_buckets" on storage.objects;
drop policy if exists "upload_own_dispute_docs" on storage.objects;
drop policy if exists "update_own_dispute_docs" on storage.objects;
drop policy if exists "delete_own_dispute_docs" on storage.objects;

-- Allow all authenticated users to read files from dispute-documents and chargeback-videos buckets
-- This is needed for createSignedUrl to work and for preview functionality
create policy "read_dispute_and_video_buckets"
  on storage.objects
  for select
  using (
    bucket_id in ('dispute-documents', 'chargeback-videos')
  );

-- Allow users to upload their own dispute documents into a folder prefixed by their user id
create policy "upload_own_dispute_docs"
  on storage.objects
  for insert
  with check (
    bucket_id = 'dispute-documents'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to update their own dispute documents
create policy "update_own_dispute_docs"
  on storage.objects
  for update
  using (
    bucket_id = 'dispute-documents'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'dispute-documents'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own dispute documents
create policy "delete_own_dispute_docs"
  on storage.objects
  for delete
  using (
    bucket_id = 'dispute-documents'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );