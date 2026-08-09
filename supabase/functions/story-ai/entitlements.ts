import { type SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';
import { AppError } from './errors.ts';

export type EntitlementReservation = { requestId: string; reservationId: string; planKey: string; bucket: string; amount: number; remaining: number };

export async function assertAiEntitlement(input: { service: SupabaseClient; userId: string; requestId: string; operation: string; storyId?: string | null; requestedPageCount?: number; requestedImageCount?: number }): Promise<EntitlementReservation> {
  const { data, error } = await input.service.rpc('reserve_ai_entitlement', { p_user_id: input.userId, p_request_id: input.requestId, p_operation: input.operation, p_story_id: input.storyId || null, p_requested_page_count: input.requestedPageCount ?? null, p_requested_image_count: input.requestedImageCount ?? null });
  if (error) {
    if (error.message?.includes('ENTITLEMENT_LIMIT')) throw new AppError('ENTITLEMENT_LIMIT', 'Generation limit reached. Visit Billing to review your usage or upgrade.', 402);
    console.error('entitlement reservation failed', input.operation, error.code);
    throw new AppError('ENTITLEMENT_UNAVAILABLE', 'Generation limits could not be verified. Please try again.', 503);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.reservation_id) throw new AppError('ENTITLEMENT_UNAVAILABLE', 'Generation limits could not be verified. Please try again.', 503);
  return { requestId: input.requestId, reservationId: row.reservation_id, planKey: row.plan_key, bucket: row.bucket, amount: row.amount, remaining: row.remaining };
}

export async function finalizeAiEntitlement(service: SupabaseClient, reservation: EntitlementReservation | null) {
  if (!reservation) return; const { error } = await service.rpc('finalize_ai_entitlement', { p_reservation_id: reservation.reservationId, p_provider_request_id: null });
  if (error) console.error('entitlement finalization failed', reservation.reservationId);
}

export async function releaseAiEntitlement(service: SupabaseClient, reservation: EntitlementReservation | null) {
  if (!reservation) return; const { error } = await service.rpc('release_ai_entitlement', { p_reservation_id: reservation.reservationId });
  if (error) console.error('entitlement release failed', reservation.reservationId);
}
