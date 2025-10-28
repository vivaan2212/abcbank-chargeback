-- Add RLS policies for user_roles table so users can view their own roles
CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Assign customer role to all existing users who don't have a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'customer'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.user_id IS NULL
AND u.email != 'abcbank@zamp.ai'
ON CONFLICT (user_id, role) DO NOTHING;