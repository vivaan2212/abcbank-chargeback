-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create disputes table to track chargeback cases for dashboard
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id),
  status TEXT NOT NULL DEFAULT 'started',
  eligibility_status TEXT,
  eligibility_reasons TEXT[],
  reason_id TEXT,
  reason_label TEXT,
  custom_reason TEXT,
  documents JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own disputes"
ON public.disputes
FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Users can create their own disputes"
ON public.disputes
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Users can update their own disputes"
ON public.disputes
FOR UPDATE
USING (auth.uid() = customer_id);

-- Create index for faster queries
CREATE INDEX idx_disputes_customer_id ON public.disputes(customer_id);
CREATE INDEX idx_disputes_conversation_id ON public.disputes(conversation_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_disputes_updated_at
BEFORE UPDATE ON public.disputes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for dashboard sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;