import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { toServiceError } from '@/services/errors';

export async function list(){
  const user=await requireAuthenticatedUser();
  const {data,error}=await getSupabaseClient().from('print_orders').select('id,story_id,provider_key,provider_order_id,quantity,currency,total_cents,payment_status,fulfillment_status,tracking_number,tracking_url,carrier,last_error_code,last_error_message,submitted_at,shipped_at,created_at,updated_at,stories!print_orders_story_owner_fk(title)').eq('buyer_user_id',user.id).order('created_at',{ascending:false});
  if(error)throw toServiceError(error,'Print orders');return data||[];
}
