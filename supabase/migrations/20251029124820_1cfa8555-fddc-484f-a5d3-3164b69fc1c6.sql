-- Create private bucket for dispute artifacts
insert into storage.buckets (id, name, public)
values ('dispute-documents', 'dispute-documents', false)
on conflict (id) do nothing;

-- Enable RLS is default on storage.objects. Create policies for this bucket.
-- Policy: users can upload to their own folder: {user_id}/...
create policy "Users can upload their own dispute documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'dispute-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: users can read their own documents (to allow creating signed URLs)
create policy "Users can read their own dispute documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'dispute-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Optional: allow users to delete their own documents
create policy "Users can delete their own dispute documents"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'dispute-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );