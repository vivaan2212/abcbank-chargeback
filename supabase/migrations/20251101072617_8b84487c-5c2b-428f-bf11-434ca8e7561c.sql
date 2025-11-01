-- Create table to store dispute documents metadata
CREATE TABLE IF NOT EXISTS public.dispute_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  requirement_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dispute_documents ENABLE ROW LEVEL SECURITY;

-- Customers can view their own documents
CREATE POLICY "Customers can view their own documents"
ON public.dispute_documents
FOR SELECT
USING (auth.uid() = customer_id OR has_role(auth.uid(), 'bank_admin'::app_role));

-- Customers can insert their own documents
CREATE POLICY "Customers can insert their own documents"
ON public.dispute_documents
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

-- Create index for faster queries
CREATE INDEX idx_dispute_documents_dispute_id ON public.dispute_documents(dispute_id);
CREATE INDEX idx_dispute_documents_transaction_id ON public.dispute_documents(transaction_id);
CREATE INDEX idx_dispute_documents_customer_id ON public.dispute_documents(customer_id);

-- Add trigger for updated_at
CREATE TRIGGER update_dispute_documents_updated_at
BEFORE UPDATE ON public.dispute_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();