import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertAt } from '@/components/notes/note-editor';
import { NoteText } from '@/components/notes/note-text';
import { filterEvents, PatientChart } from '@/components/notes/patient-chart';
import type { Anamnesis } from '@/lib/anamneses/repository';
import type { Appointment } from '@/lib/appointments/schema';
import type { Assessment } from '@/lib/assessments/schema';
import type { MealPlanSummary } from '@/lib/meal-plans/schema';
import { parseNote, toggleBold, toggleList } from '@/lib/notes/format';
import type { ClinicalNote, NoteResult } from '@/lib/notes/schema';
import { buildTimeline, noteChains } from '@/lib/notes/timeline';

const createNote = vi.fn<(p: string, b: string, o?: { supersedesId?: string; sign?: boolean }) => Promise<NoteResult>>(async () => ({ ok: true, id: 'new' }));
const updateNote = vi.fn<(p: string, id: string, b: string) => Promise<NoteResult>>(async () => ({ ok: true }));
const signNote = vi.fn<(p: string, id: string) => Promise<NoteResult>>(async () => ({ ok: true }));
const deleteNote = vi.fn<(p: string, id: string) => Promise<NoteResult>>(async () => ({ ok: true }));
vi.mock('@/lib/notes/actions', () => ({
  createNote: (p: string, b: string, o?: { supersedesId?: string; sign?: boolean }) => createNote(p, b, o),
  updateNote: (p: string, id: string, b: string) => updateNote(p, id, b),
  signNote: (p: string, id: string) => signNote(p, id),
  deleteNote: (p: string, id: string) => deleteNote(p, id),
}));
vi.mock('@/lib/snippets/actions', () => ({ listSnippets: async () => [] }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const P = '11111111-1111-4111-8111-111111111111';
const note = (id: string, extra: Partial<ClinicalNote> = {}): ClinicalNote => ({
  id, patient_id: P, appointment_id: null, body: `Texto ${id}`, supersedes_id: null, user_created: 'u', date_created: '2026-11-10T13:00:00Z',
  date_updated: null, signed_at: null, signer_name: null, signer_crn: null, own: true, ...extra,
});
const signed = (id: string, extra: Partial<ClinicalNote> = {}) => note(id, { signed_at: '2026-11-10T14:00:00Z', signer_name: 'Ana Souza', signer_crn: 'CRN-9 12345', ...extra });

describe('formatação', () => {
  it('negrito põe e tira **', () => {
    expect(toggleBold('ola mundo', 4, 9)).toEqual({ text: 'ola **mundo**', start: 6, end: 11 });
    expect(toggleBold('ola **mundo**', 6, 11)).toEqual({ text: 'ola mundo', start: 4, end: 9 });
    expect(toggleBold('', 0, 0).text).toBe('**texto**');
  });
  it('lista marca e desmarca as linhas da seleção', () => {
    expect(toggleList('a\nb\nc', 2, 4).text).toBe('a\n- b\n- c');
    expect(toggleList('a\n- b\n- c', 3, 9).text).toBe('a\nb\nc');
  });
  it('insere orientação no cursor como linha própria', () => {
    expect(insertAt('abc', 3, 'Beba água.').text).toBe('abc\nBeba água.');
    expect(insertAt('', 0, ' X ').text).toBe('X');
    expect(insertAt('a\nb', 2, 'X').text).toBe('a\nX\nb');
  });
  it('separa parágrafos e listas e nunca interpreta HTML', () => {
    expect(parseNote('Queixa: **dor**\n\n- item 1\n- item 2').map((b) => b.type)).toEqual(['p', 'ul']);
    render(<NoteText text={'<img src=x onerror=alert(1)> **forte**\n- um'} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('forte').tagName).toBe('STRONG');
    expect(screen.getByRole('listitem').textContent).toBe('um');
  });
});

describe('versões e linha do tempo', () => {
  it('agrupa a cadeia de retificações com a versão vigente', () => {
    const chains = noteChains([signed('c', { supersedes_id: 'b' }), signed('b', { supersedes_id: 'a' }), signed('a'), note('x')]);
    expect(chains.map((c) => [c.current.id, c.previous.map((p) => p.id)])).toEqual([['c', ['b', 'a']], ['x', []]]);
  });
  it('junta os eventos em ordem cronológica e ignora cancelados e rascunhos de plano', () => {
    const appointments = [{ id: 'ap', starts_at: '2026-11-12T13:00:00Z', ends_at: '', type: 'return', mode: 'online', status: 'completed', patient_id: null, meeting_url: null, notes: null } as Appointment];
    const anamneses = [
      { id: 'an', status: 'answered', answered_at: '2026-11-05T10:00:00Z', date_created: '2026-11-01T10:00:00Z', title: 'Clínica' },
      { id: 'cx', status: 'cancelled', answered_at: null, date_created: '2026-11-02T10:00:00Z', title: 'X' },
    ] as Anamnesis[];
    const assessments = [{ id: 'as', assessed_at: '2026-11-08', weight_kg: 70.5, results: { bmi: 24.1 } }] as Assessment[];
    const plans = [
      { id: 'pl', title: 'Plano A', published_at: '2026-11-09T10:00:00Z', totals: { energy_kcal: 1800.4 } },
      { id: 'dr', title: 'Rascunho', published_at: null, totals: null },
    ] as MealPlanSummary[];
    const ev = buildTimeline(P, { notes: [signed('n')], appointments, anamneses, assessments, plans });
    expect(ev.map((e) => e.kind)).toEqual(['consulta', 'evolucao', 'plano', 'avaliacao', 'anamnese']);
    const plan = ev.find((e) => e.kind === 'plano');
    expect(plan && plan.kind !== 'evolucao' && plan.detail).toBe('1800 kcal');
    const as = ev.find((e) => e.kind === 'avaliacao');
    expect(as && as.kind !== 'evolucao' && as.detail).toBe('70,5 kg · IMC 24,1');
    expect(filterEvents(ev, new Set(['plano', 'consulta'])).map((e) => e.id)).toEqual(['ap', 'pl']);
  });
});

describe('PatientChart', () => {
  const events = (notes: ClinicalNote[]) => buildTimeline(P, { notes });

  it('cria evolução e assina com confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PatientChart patientId={P} events={[]} archived={false} />);
    fireEvent.change(screen.getByLabelText('Nova evolução'), { target: { value: 'Paciente refere melhora.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar e assinar/ })));
    expect(createNote).toHaveBeenCalledWith(P, 'Paciente refere melhora.', { sign: true });
    expect(refresh).toHaveBeenCalled();
  });
  it('não salva vazia', async () => {
    render(<PatientChart patientId={P} events={[]} archived={false} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ })));
    expect(screen.getByRole('alert').textContent).toMatch(/Escreva a evolução/);
    expect(createNote).not.toHaveBeenCalled();
  });
  it('rascunho próprio: editar, assinar e apagar; assinada: só retificar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PatientChart patientId={P} events={events([note('d', { date_created: '2026-11-11T10:00:00Z' }), signed('s')])} archived={false} />);
    const [draft, done] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(within(draft).getByText('Rascunho')).toBeTruthy();
    await act(async () => fireEvent.click(within(draft).getByRole('button', { name: 'Assinar' })));
    expect(signNote).toHaveBeenCalledWith(P, 'd');
    expect(within(done).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(within(done).getByText(/Assinada por/).textContent).toContain('CRN-9 12345');
    fireEvent.click(within(done).getByRole('button', { name: 'Retificar' }));
    const box = within(done).getByLabelText(/Retificação/) as HTMLTextAreaElement;
    expect(box.value).toBe('Texto s');
    fireEvent.change(box, { target: { value: 'Texto corrigido' } });
    await act(async () => fireEvent.click(within(done).getByRole('button', { name: /Salvar rascunho/ })));
    expect(createNote).toHaveBeenCalledWith(P, 'Texto corrigido', { supersedesId: 's', sign: false });
  });
  it('mostra o histórico de versões da retificada', () => {
    render(<PatientChart patientId={P} events={events([signed('b', { supersedes_id: 'a', body: 'Nova' }), signed('a', { body: 'Antiga' })])} archived={false} />);
    expect(screen.getByText('Retificada')).toBeTruthy();
    expect(screen.queryByText('Antiga')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ver versões anteriores \(1\)/ }));
    expect(screen.getByText('Antiga')).toBeTruthy();
  });
  it('rascunho de outro profissional não tem ações; paciente arquivado não recebe evolução', () => {
    render(<PatientChart patientId={P} events={events([note('o', { own: false })])} archived />);
    expect(screen.queryByLabelText('Nova evolução')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull();
  });
  it('filtra por tipo', () => {
    render(<PatientChart patientId={P} events={events([signed('s')])} archived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Planos' }));
    expect(screen.getByText('Nenhum evento desse tipo.')).toBeTruthy();
  });
});
