import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedingChecklist } from '@/components/maternal/feeding-checklist';
import { GuardiansPanel } from '@/components/maternal/guardians';
import { feedingChecklist, isSeriousReaction, monthsBetween } from '@/lib/maternal/feeding';
import type { FeedingRecord } from '@/lib/maternal/types';

const saveFeeding = vi.fn(async () => ({ ok: true as const, data: {} }));
const saveMyFeeding = vi.fn(async () => ({ ok: true as const, data: {} }));
const updateGuardian = vi.fn(async () => ({ ok: true as const, data: {} }));
vi.mock('@/lib/maternal/actions', () => ({
  saveFeeding: (...a: unknown[]) => saveFeeding(...(a as [])),
  saveMyFeeding: (...a: unknown[]) => saveMyFeeding(...(a as [])),
  deleteFeeding: vi.fn(),
  createGuardian: vi.fn(),
  deleteGuardian: vi.fn(),
  updateGuardian: (...a: unknown[]) => updateGuardian(...(a as [])),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const egg: FeedingRecord = { kind: 'allergen', item: 'egg', introduced_on: '2026-10-01', reaction: 'moderate', notes: 'manchas', by_guardian: true };

describe('introdução alimentar (RN-116)', () => {
  it('checklist: registro, hora de oferecer e idade de referência', () => {
    const items = feedingChecklist('allergen', [egg], 7);
    expect(items.find((i) => i.code === 'egg')?.record).toEqual(egg);
    expect(items.find((i) => i.code === 'peanut')?.due).toBe(true);
    expect(items.find((i) => i.code === 'cow_milk')?.due).toBe(false);
    expect(feedingChecklist('texture', [], 8).filter((i) => i.due).map((i) => i.code)).toEqual(['mashed', 'soft_pieces']);
    expect(isSeriousReaction('moderate')).toBe(true);
    expect(isSeriousReaction('mild')).toBe(false);
    expect(Math.round(monthsBetween('2026-01-01', '2026-07-01'))).toBe(6);
  });

  it('reação moderada fica em destaque e o responsável registra pelo app', async () => {
    render(<FeedingChecklist kind="allergen" title="Alergênicos" items={feedingChecklist('allergen', [egg], 7)} mode={{ kind: 'app', recordId: '11111111-1111-1111-1111-111111111111' }} />);
    expect(screen.getByText('Reação moderada')).toBeTruthy();
    expect(screen.getByText('(registrado pelo responsável)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Amendoim' }));
    fireEvent.change(screen.getByLabelText('Reação'), { target: { value: 'severe' } });
    expect(screen.getByText(/Seu nutricionista será avisado/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' })));
    expect(saveMyFeeding).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'allergen', 'peanut', expect.objectContaining({ reaction: 'severe' }));
    expect(saveFeeding).not.toHaveBeenCalled();
  });

  it('textura não pede reação', () => {
    render(<FeedingChecklist kind="texture" title="Texturas" items={feedingChecklist('texture', [], 7)} mode={{ kind: 'pro', patientId: 'p' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Amassada com garfo' }));
    expect(screen.queryByLabelText('Reação')).toBeNull();
  });
});

describe('responsáveis (RN-118)', () => {
  it('sem consentimento: avisa e registra o consentimento', async () => {
    render(<GuardiansPanel patientId="p1" guardians={[{ id: 'g1', full_name: 'Maria Silva', relationship: 'mother', email: 'maria@ex.com', phone: null, consent_at: null, consent_method: null, notes: null }]} />);
    expect(screen.getByText('Sem consentimento')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Forma do consentimento'), { target: { value: 'signed_form' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Registrar consentimento' })));
    expect(updateGuardian).toHaveBeenCalledWith('p1', 'g1', { consent: 'signed_form' });
  });

  it('com consentimento: mostra a data e permite retirar', () => {
    render(<GuardiansPanel patientId="p1" guardians={[{ id: 'g1', full_name: 'João', relationship: 'father', email: null, phone: null, consent_at: '2026-11-20T15:00:00Z', consent_method: 'in_person', notes: null }]} />);
    expect(screen.getByText('Consentimento registrado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirar consentimento' })).toBeTruthy();
  });
});
