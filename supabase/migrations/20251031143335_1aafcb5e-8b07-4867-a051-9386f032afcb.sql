-- Create knowledge base content table
CREATE TABLE IF NOT EXISTS public.knowledge_base_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE,
  section_title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create knowledge base updates tracking table
CREATE TABLE IF NOT EXISTS public.knowledge_base_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_by UUID REFERENCES auth.users(id) NOT NULL,
  section_key TEXT NOT NULL,
  previous_content TEXT,
  new_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_base_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_updates ENABLE ROW LEVEL SECURITY;

-- Policies for knowledge_base_content (everyone can read, only editors can write)
CREATE POLICY "Everyone can read knowledge base content"
  ON public.knowledge_base_content
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Editors can update knowledge base content"
  ON public.knowledge_base_content
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'bank_admin'
    )
  );

CREATE POLICY "Editors can insert knowledge base content"
  ON public.knowledge_base_content
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'bank_admin'
    )
  );

-- Policies for knowledge_base_updates (everyone can read, only editors can write)
CREATE POLICY "Everyone can read knowledge base updates"
  ON public.knowledge_base_updates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Editors can log updates"
  ON public.knowledge_base_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'bank_admin'
    )
  );

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_knowledge_base_content_updated_at
  BEFORE UPDATE ON public.knowledge_base_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial knowledge base content
INSERT INTO public.knowledge_base_content (section_key, section_title, content)
VALUES (
  'chargeback_for_banks',
  'Chargeback for Banks',
  'This agent automates the end-to-end chargeback filing process by eliminating manual case review, reducing human error in dispute categorization, and ensuring timely, compliant submissions across card networks. It processes high-volume transaction and dispute data, identifies eligible chargebacks, compiles supporting evidence, and files them accurately within network timelines — enabling faster recoveries and consistent adherence to Visa and Mastercard rules that would be impossible through manual operations.'
)
ON CONFLICT (section_key) DO NOTHING;