import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgendaWeek } from '@/components/agenda/agenda-week';
import {
  addDays,
  appointmentFormSchema,
  freeSlots,
  localDate,
  localTime,
  toInstant,
  today,
  weekDays,
  weekStart,
  type Appointment,
} from '@/lib/appointments/schema';

type Result = { ok: true } | { ok: false; message: string };
const createAppointment = vi.fn<(input: unknown) => Promise<Result>>(async () => ({ ok: true }));
const setAppointmentStatus = vi.fn<(id: string, status: string) => Promise<Result>>(async () => ({ ok: true }));
const rescheduleAppointment = vi.fn<(id: string, input: unknown) => Promise<Result>>(async () => ({ ok: true }));
vi.mock('@/lib/appointments/actions', () => ({
  createAppointment: (i: unknown) => createAppointment(i),
  setAppointmentStatus: (id: string, s: string) => setAppointmentStatus(id, s),
  rescheduleAppointment: (id: string, i: unknown) => rescheduleAppointment(id, i),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  createAppointment.mockClear();
  setAppointmentStatus.mockClear();
  rescheduleAppointment.mockClear();
});

const P1 = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Marina Costa' };
const appt = (id: string, date: string, from: string, to: string, extra: Partial<Appointment> = {}): Appointment => ({
  id, patient_id: P1, starts_at: toInstant(date, from), ends_at: toInstant(date, to),
  type: 'return', mode: 'in_person', status: 'scheduled', meeting_url: null, notes: null, ...extra,
});

describe('fuso e calendário (Brasília, UTC-3)', () => {
  it('converte horário local para UTC e de volta', () => {
    expect(toInstant('2026-11-13', '09:30')).toBe('2026-11-13T12:30:00.000Z');
    expect(localTime('2026-11-13T12:30:00.000Z')).toBe('09:30');
    // 22h em Brasília já é dia seguinte em UTC
    expect(localDate(toInstant('2026-11-13', '22:00'))).toBe('2026-11-13');
  });
  it('"hoje" segue Brasília, não UTC', () => {
    expect(today(new Date('2026-11-14T01:00:00Z'))).toBe('2026-11-13');
  });
  it('semana começa na segunda', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-09'); // quinta → segunda
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // domingo → segunda anterior
    expect(weekDays('2026-11-09')).toHaveLength(7);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('freeSlots', () => {
  const day = '2026-11-13';
  it('pula horários ocupados e respeita a duração', () => {
    const busy = [appt('a', day, '09:00', '10:00'), appt('b', day, '11:00', '11:45', { status: 'cancelled' })];
    const slots = freeSlots(day, busy, 60, { start: '08:00', end: '12:00' });
    expect(slots).toEqual(['08:00', '10:00', '10:30', '11:00']);
  });
  it('falta e cancelada não ocupam; consulta de outro dia não conta', () => {
    const list = [appt('a', day, '08:00', '12:00', { status: 'no_show' }), appt('b', '2026-11-14', '08:00', '12:00')];
    expect(freeSlots(day, list, 60, { start: '08:00', end: '10:00' })).toEqual(['08:00', '08:30', '09:00']);
  });
  it('hoje não oferece horário que já passou', () => {
    const now = new Date(toInstant(day, '10:10'));
    expect(freeSlots(day, [], 30, { start: '08:00', end: '12:00', now })[0]).toBe('10:30');
  });
});

describe('appointmentFormSchema', () => {
  const ok = { patient_id: P1.id, date: '2026-11-13', time: '09:00', duration: 45, type: 'return', mode: 'online', meeting_url: 'https://meet.google.com/abc' };
  it('aceita uma consulta válida', () => expect(appointmentFormSchema.safeParse(ok).success).toBe(true));
  it.each([
    [{ meeting_url: 'javascript:alert(1)' }],
    [{ duration: 5 }],
    [{ time: '25:00' }],
    [{ patient_id: 'x' }],
  ])('rejeita %j', (patch) => expect(appointmentFormSchema.safeParse({ ...ok, ...patch }).success).toBe(false));
});

describe('AgendaWeek', () => {
  const start = '2026-11-09';
  it('mostra as consultas no dia certo e conta as da semana', () => {
    render(<AgendaWeek start={start} todayDate="2026-11-11" appointments={[appt('a', '2026-11-11', '09:00', '10:00'), appt('b', '2026-11-12', '14:00', '14:45', { status: 'cancelled' })]} patients={[P1]} />);
    const qua = screen.getByRole('region', { name: /qua 11/ });
    expect(within(qua).getByText('09:00–10:00')).toBeTruthy();
    expect(within(qua).getByRole('link', { name: 'Marina Costa' }).getAttribute('href')).toBe(`/app/pacientes/${P1.id}`);
    expect(screen.getByText('1 consulta(s) na semana')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Próxima semana' }).getAttribute('href')).toBe('/app/agenda?semana=2026-11-16');
  });

  it('confirma e cancela pela própria consulta', async () => {
    render(<AgendaWeek start={start} todayDate="2026-11-11" appointments={[appt('a', '2026-11-11', '09:00', '10:00')]} patients={[P1]} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })));
    expect(setAppointmentStatus).toHaveBeenCalledWith('a', 'confirmed');
    setAppointmentStatus.mockResolvedValueOnce({ ok: false, message: 'Você não tem permissão para alterar a agenda deste consultório.' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })));
    expect(screen.getByRole('status').textContent).toMatch(/não tem permissão/);
  });

  it('remarca mantendo a duração', async () => {
    render(<AgendaWeek start={start} todayDate="2026-11-11" appointments={[appt('a', '2026-11-11', '09:00', '09:45')]} patients={[P1]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remarcar' }));
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '15:00' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' })));
    expect(rescheduleAppointment).toHaveBeenCalledWith('a', { date: '2026-11-11', time: '15:00', duration: 45 });
  });

  it('marca consulta escolhendo um horário livre sugerido', async () => {
    render(<AgendaWeek start={start} todayDate="2026-11-11" appointments={[]} patients={[P1]} defaultPatientId={P1.id} />);
    // com paciente pré-escolhido (vindo da ficha), o formulário já abre
    const form = screen.getByRole('form', { name: 'Nova consulta' });
    fireEvent.change(within(form).getByLabelText('Data'), { target: { value: '2026-11-13' } });
    fireEvent.click(within(form).getByRole('button', { name: '14:00' }));
    await act(async () => fireEvent.click(within(form).getByRole('button', { name: 'Marcar consulta' })));
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ patient_id: P1.id, date: '2026-11-13', time: '14:00', duration: 45, type: 'return' }));
    expect(screen.getByRole('status').textContent).toBe('Consulta marcada.');
  });

  it('avisa quando não consegue carregar', () => {
    render(<AgendaWeek start={start} todayDate="2026-11-11" appointments={null} patients={[]} />);
    expect(screen.getByText(/Não foi possível carregar a agenda/)).toBeTruthy();
  });
});
