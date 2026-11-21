import { describe, expect, it } from 'vitest';
import { navModel } from '@/components/app/app-nav';
import { hoursLabel, KIND_LABEL, REMINDER_HOURS } from '@/lib/notifications/types';

describe('avisos', () => {
  it('rótulos dos horários de lembrete', () => {
    expect(hoursLabel(24)).toBe('1 dia antes');
    expect(hoursLabel(72)).toBe('3 dias antes');
    expect(hoursLabel(1)).toBe('1 hora antes');
    expect(hoursLabel(6)).toBe('6 horas antes');
    expect(REMINDER_HOURS).toEqual([72, 48, 24, 12, 6, 3, 2, 1]);
  });
  it('sem WhatsApp entre os tipos', () => {
    expect(Object.keys(KIND_LABEL)).not.toContain('whatsapp');
  });
  it('menu do consultório leva aos avisos', () => {
    const conta = navModel('/app/clinico').find((g) => g.title === 'Conta');
    expect(conta?.links.map((l) => l.href)).toContain('/app/configuracoes/avisos');
  });
});

// ── Painel de canais do paciente ───────────────────────────────────────────
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ContactPrefs } from '@/lib/notifications/types';

const saveMyContactPrefs = vi.fn(async () => ({ ok: false as const, message: 'Falhou agora.' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/notifications/actions', () => ({
  saveMyContactPrefs: (...a: unknown[]) => saveMyContactPrefs(...(a as [])),
  savePatientContactPrefs: vi.fn(), createMyTelegramLink: vi.fn(), createPatientTelegramLink: vi.fn(), unlinkMyTelegram: vi.fn(), unlinkPatientTelegram: vi.fn(),
}));

const prefs: ContactPrefs = { email: 'p@x.com', email_opt_in: true, telegram_opt_in: true, telegram_linked: false, telegram_name: null, telegram_linked_at: null, telegram_ready: false };

describe('ContactPrefsPanel', () => {
  it('sem bot ligado avisa que o importante vai por e-mail; caixa volta se a gravação falha', async () => {
    const { ContactPrefsPanel } = await import('@/components/notifications/contact-prefs');
    render(<ContactPrefsPanel mode="patient" prefs={prefs} />);
    expect(screen.getByText(/O Telegram ainda não foi ligado/)).toBeTruthy();
    const box = screen.getByRole('checkbox', { name: /avisos importantes por e-mail/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => fireEvent.click(box));
    expect(saveMyContactPrefs).toHaveBeenCalledWith(null, { email_opt_in: false });
    expect((screen.getByRole('checkbox', { name: /avisos importantes por e-mail/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Falhou agora.');
  });
});
