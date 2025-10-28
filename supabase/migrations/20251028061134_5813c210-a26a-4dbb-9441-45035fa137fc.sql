-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('customer', 'bank_admin');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create trigger function to assign customer role on signup
CREATE OR REPLACE FUNCTION public.assign_customer_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_customer_role();

-- Create bank admin account
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'abcbank@zamp.ai',
  crypt('12345678', gen_salt('bf')),
  NOW(),
  '{"full_name": "ABC Bank Admin"}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Assign bank_admin role to the bank account
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'bank_admin'
FROM auth.users
WHERE email = 'abcbank@zamp.ai';

-- Update RLS policies for disputes table
DROP POLICY IF EXISTS "Users can view their own disputes" ON public.disputes;
CREATE POLICY "Users can view their own disputes" 
ON public.disputes 
FOR SELECT 
USING (
  auth.uid() = customer_id 
  OR public.has_role(auth.uid(), 'bank_admin')
);

-- Update RLS policies for transactions table
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions" 
ON public.transactions 
FOR SELECT 
USING (
  auth.uid() = customer_id 
  OR public.has_role(auth.uid(), 'bank_admin')
);

-- Update RLS policies for conversations table
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
CREATE POLICY "Users can view their own conversations" 
ON public.conversations 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'bank_admin')
);

-- Update RLS policies for messages table
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations" 
ON public.messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE conversations.id = messages.conversation_id
      AND (conversations.user_id = auth.uid() OR public.has_role(auth.uid(), 'bank_admin'))
  )
);