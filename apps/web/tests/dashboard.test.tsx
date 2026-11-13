import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TodayPanel } from '@/components/app/today-panel';
import { toInstant } from '@/lib/appointments/schema';
import { birthdaysAhead, withoutReturn, type DashPatient } from '@/lib/dashboard';
import type { Dashboard } from '@/lib/dashboard-data';

afterEach(cleanup);

const p = (id: string, full_name: string, birth_date: string | null, status = 'active'): DashPatient => ({ id, full_name, birth_date, status });

describe('aniversariantes', () => {
  it('pega os próximos 7 dias (inclui hoje, vira o ano) e calcula a idade que vai completar', () => {
    const list = [p('1', 'Ana', '1990-12-30'), p('2', 'Bia', '2000-01-02'), p('3', 'Caio', '1985-01-10'), p('4', 'Duda', '1990-12-28', 'archived'), p('5', 'Eva', null)];
    const r = birthdaysAhead(list, '2026-12-28');
    expect(r.map((x) => [x.full_name, x.date, x.age])).toEqual([['Ana', '2026-12-30', 36], ['Bia', '2027-01-02', 27]]);
  });
  it('29 de fevereiro comemora em 28/02 nos anos não bissextos', () => {
    expect(birthdaysAhead([p('1', 'Leap', '2000-02-29')], '2027-02-25').map((x) => x.date)).toEqual(['2027-02-28']);
  });
});

describe('sem retorno', () => {
  const now = new Date('2026-11-13T15:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const ahead = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  it('última consulta concluída há mais de 60 dias e sem retorno marcado', () => {
    const patients = [p('a', 'Antiga', null), p('b', 'Com retorno', null), p('c', 'Recente', null), p('d', 'Nunca veio', null), p('e', 'Arquivada', null, 'archived')];
    const appts = [
      { patient_id: 'a', starts_at: ago(90), status: 'completed' },
      { patient_id: 'a', starts_at: ago(70), status: 'no_show' },
      { patient_id: 'b', starts_at: ago(100), status: 'completed' },
      { patient_id: 'b', starts_at: ahead(5), status: 'scheduled' },
      { patient_id: 'c', starts_at: ago(20), status: 'completed' },
      { patient_id: 'e', starts_at: ago(200), status: 'completed' },
    ];
    const r = withoutReturn(patients, appts, now, 60);
    expect(r.map((x) => [x.full_name, x.daysSince])).toEqual([['Antiga', 90]]);
  });
});

const appt = (id: string, from: string, to: string, status = 'scheduled') => ({
  id, patient_id: { id: `p${id}`, full_name: `Paciente ${id}` }, starts_at: toInstant('2026-11-13', from), ends_at: toInstant('2026-11-13', to),
  type: 'return' as const, mode: 'in_person' as const, status: status as 'scheduled', meeting_url: null, notes: null,
});

describe('painel inicial', () => {
  const data: Dashboard = {
    todayDate: '2026-11-13',
    appointments: [appt('1', '09:00', '09:45'), appt('2', '10:00', '10:45', 'cancelled'), appt('3', '14:00', '15:00', 'completed')],
    pendingAnamneses: [{ id: 'x', title: 'Anamnese clínica (adulto)', answered_at: '2026-11-12T15:00:00Z', patient_id: { id: 'p9', full_name: 'Rafael Lima' } }],
    birthdays: [{ ...p('b1', 'Marina Costa', '1994-11-13'), date: '2026-11-13', age: 32 }],
    withoutReturn: [],
    activePatients: 7,
  };
  it('mostra as consultas do dia (sem as canceladas) com link para a ficha', () => {
    render(<TodayPanel data={data} returnDays={60} />);
    const today = screen.getByRole('region', { name: 'Consultas de hoje' });
    expect(within(today).getByText('09:00–09:45')).toBeTruthy();
    expect(within(today).queryByText('Paciente 2')).toBeNull();
    expect(within(today).getByRole('link', { name: 'Paciente 1' }).getAttribute('href')).toBe('/app/pacientes/p1');
    expect(within(today).getByText('Concluída')).toBeTruthy();
  });
  it('anamneses a revisar, aniversário de hoje, sem retorno vazio e atalhos', () => {
    render(<TodayPanel data={data} returnDays={60} />);
    expect(within(screen.getByRole('region', { name: 'Anamneses para revisar' })).getByRole('link', { name: 'Rafael Lima' }).getAttribute('href')).toBe('/app/pacientes/p9/anamneses');
    expect(within(screen.getByRole('region', { name: 'Aniversariantes da semana' })).getByText(/hoje · 32 anos/)).toBeTruthy();
    expect(screen.getByText(/Todos os pacientes ativos com consulta recente/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Nova consulta/ }).getAttribute('href')).toBe('/app/agenda');
    expect(screen.getByText('7 pacientes ativos')).toBeTruthy();
  });
  it('cada parte que falhar mostra aviso sem derrubar as outras', () => {
    render(<TodayPanel data={{ ...data, appointments: null, birthdays: null }} returnDays={60} />);
    expect(within(screen.getByRole('region', { name: 'Consultas de hoje' })).getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Anamneses para revisar' })).getByRole('link', { name: 'Rafael Lima' })).toBeTruthy();
  });
});
