import { supabase } from "@/integrations/supabase/client";

export type UserRole = 'customer' | 'bank_admin' | null;

export async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['customer', 'bank_admin']);

    if (error) {
      console.error('Error fetching user role:', error);
      return null;
    }

    // Check if user has bank_admin role (prioritize this)
    const hasBankAdmin = data?.some(r => r.role === 'bank_admin');
    if (hasBankAdmin) return 'bank_admin';

    // Otherwise return customer if they have that role
    const hasCustomer = data?.some(r => r.role === 'customer');
    if (hasCustomer) return 'customer';

    return null;
  } catch (error) {
    console.error('Error in getUserRole:', error);
    return null;
  }
}
