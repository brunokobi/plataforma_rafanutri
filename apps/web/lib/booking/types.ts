export interface PublicPractice {
  name: string;
  brand_color: string | null;
  has_logo: boolean;
  require_approval: boolean;
  professional: { name: string | null; crn: string | null };
  headline: string | null;
  bio: string | null;
  specialties: string[];
  address: string | null;
  city: string | null;
  in_person: boolean;
  online: boolean;
  price_first_cents: number | null;
  price_return_cents: number | null;
  booking_enabled: boolean;
}
export interface SlotDay { date: string; slots: Array<{ time: string; starts_at: string }> }
export interface PublicSlots { from: string; days: SlotDay[]; slot_minutes: number }
export interface BookingInput { full_name: string; email: string; phone: string; mode: 'in_person' | 'online'; message: string; consent: boolean; starts_at: string; website: string }
export type BookingResult = { ok: true; status: 'pending' | 'confirmed' } | { ok: false; message: string; fields?: Record<string, string> };

export interface PublicProfileConfig {
  enabled: boolean;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  address: string | null;
  city: string | null;
  in_person: boolean;
  online: boolean;
  price_first_cents: number | null;
  price_return_cents: number | null;
  booking_enabled: boolean;
  require_approval: boolean;
  nutritionist_id: string | null;
  weekdays: number[];
  day_start: string;
  day_end: string;
  slot_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
}
export interface PublicProfileData { slug: string; profile: PublicProfileConfig | null; nutritionists: Array<{ id: string; name: string }> }
export interface BookingRequest { id: string; full_name: string; email: string; phone: string; mode: 'in_person' | 'online'; starts_at: string; ends_at: string; message: string | null; created_at: string }

export const DEFAULT_PROFILE: PublicProfileConfig = {
  enabled: false, headline: null, bio: null, specialties: [], address: null, city: null, in_person: true, online: true,
  price_first_cents: null, price_return_cents: null, booking_enabled: false, require_approval: true, nutritionist_id: null,
  weekdays: [1, 2, 3, 4, 5], day_start: '08:00', day_end: '18:00', slot_minutes: 60, min_notice_hours: 12, max_days_ahead: 30,
};
export const WEEKDAY_LABEL = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** "terça, 18 de nov." */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
/** "18/11/2026 às 09:00" (Brasília) */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `${date} às ${time}`;
}
