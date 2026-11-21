import { Bell } from 'lucide-react';
import { ContactPrefsPanel } from '@/components/notifications/contact-prefs';
import type { ContactPrefs } from '@/lib/notifications/types';

/** Cartão "Avisos" na ficha do paciente: Telegram (tudo) e e-mail (só o importante). */
export function PatientNotifications({ patientId, prefs, firstName }: { patientId: string; prefs: ContactPrefs | null; firstName: string }) {
  return (
    <section aria-labelledby="avisos" className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Bell className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="avisos" className="font-semibold">Avisos para {firstName}</h2>
      </div>
      {prefs ? (
        <ContactPrefsPanel mode="professional" patientId={patientId} prefs={prefs} firstName={firstName} />
      ) : (
        <p className="text-sm text-muted-foreground">Não foi possível carregar os avisos agora.</p>
      )}
    </section>
  );
}
