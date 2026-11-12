import type { Questionnaire } from '@rafanutri/forms';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicAnamnesisForm } from '@/components/forms/public-anamnesis';
import { QuestionnaireAnswers } from '@/components/forms/questionnaire-fields';
import { PatientAnamneses, whatsappLink } from '@/components/patients/patient-anamneses';
import { optionsFromLines, slug } from '@/components/questionnaires/template-editor';
import { hashAnamnesisToken, isAnamnesisToken, newAnamnesisToken } from '@/lib/anamneses/token';
import type { Anamnesis } from '@/lib/anamneses/repository';

type Save = { ok: true; status: 'sent' | 'answered' } | { ok: false; message: string; fields?: Record<string, string>; gone?: boolean };
const savePublicAnamnesis = vi.fn<(token: string, answers: unknown, final: boolean) => Promise<Save>>(async (_t, _a, final) => ({ ok: true, status: final ? 'answered' : 'sent' }));
vi.mock('@/lib/anamneses/public', () => ({ savePublicAnamnesis: (t: string, a: unknown, f: boolean) => savePublicAnamnesis(t, a, f) }));
type Send = { ok: true; link: string; expiresAt: string } | { ok: false; message: string };
const sendAnamnesis = vi.fn<(p: string, t: string, d: number) => Promise<Send>>(async () => ({ ok: true, link: 'https://rafanutri.brunokobi.tech/r/abc', expiresAt: '2026-11-19T12:00:00Z' }));
const reviewAnamnesis = vi.fn(async () => ({ ok: true as const }));
const cancelAnamnesis = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/anamneses/actions', () => ({
  sendAnamnesis: (p: string, t: string, d: number) => sendAnamnesis(p, t, d),
  reviewAnamnesis: () => reviewAnamnesis(),
  cancelAnamnesis: () => cancelAnamnesis(),
}));
vi.mock('@/lib/questionnaires/actions', () => ({ saveTemplate: vi.fn(), deleteTemplate: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const schema: Questionnaire = {
  version: 1,
  sections: [
    {
      title: 'Saúde',
      questions: [
        { id: 'usa_med', type: 'yesno', label: 'Usa medicamentos?', required: true },
        { id: 'meds', type: 'text', label: 'Quais?', required: true, show_if: { question: 'usa_med', equals: true } },
        { id: 'sono', type: 'scale', label: 'Como dorme?', min: 1, max: 5 },
      ],
    },
  ],
};
const TOKEN = 'a'.repeat(43);
const data = { title: 'Anamnese clínica', schema, answers: {}, expires_at: '2026-11-19T12:00:00Z', patient_first_name: 'Ana', practice: { name: 'Consultório X', brand_color: '#2E7D32' }, professional: { name: 'Dra. Rafa', crn: 'CRN-9 12345' } };

describe('token do link público', () => {
  it('gera 43 caracteres base64url e guarda só o hash sha256', () => {
    const { token, hash } = newAnamnesisToken();
    expect(isAnamnesisToken(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAnamnesisToken(token)).toBe(hash);
    expect(newAnamnesisToken().token).not.toBe(token);
    expect(isAnamnesisToken('curto')).toBe(false);
  });
});

describe('formulário público', () => {
  it('pergunta condicional aparece só quando a condição vale', () => {
    render(<PublicAnamnesisForm token={TOKEN} data={data} />);
    expect(screen.queryByLabelText(/Quais\?/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(screen.getByLabelText(/Quais\?/)).toBeTruthy();
  });

  it('não envia sem as obrigatórias e destaca o que falta', async () => {
    render(<PublicAnamnesisForm token={TOKEN} data={data} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' })));
    expect(savePublicAnamnesis).not.toHaveBeenCalled();
    expect(screen.getAllByText('Resposta obrigatória.').length).toBe(1);
  });

  it('salva rascunho sem exigir obrigatórias e envia no final', async () => {
    render(<PublicAnamnesisForm token={TOKEN} data={data} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar depois' })));
    expect(savePublicAnamnesis).toHaveBeenCalledWith(TOKEN, {}, false);
    expect(screen.getByRole('status').textContent).toMatch(/Rascunho salvo/);
    fireEvent.click(screen.getByRole('radio', { name: 'Não' }));
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' })));
    expect(savePublicAnamnesis).toHaveBeenLastCalledWith(TOKEN, { usa_med: false, sono: 4 }, true);
    expect(screen.getByText(/Respostas enviadas. Obrigado, Ana!/)).toBeTruthy();
  });

  it('link que deixou de valer mostra o aviso', async () => {
    savePublicAnamnesis.mockResolvedValueOnce({ ok: false, gone: true, message: 'Este link não está mais disponível.' });
    render(<PublicAnamnesisForm token={TOKEN} data={data} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar depois' })));
    expect(screen.getByText('Link indisponível')).toBeTruthy();
  });
});

const anamnesis = (over: Partial<Anamnesis>): Anamnesis => ({
  id: '22222222-2222-4222-8222-222222222222', patient_id: 'p', title: 'Anamnese clínica', schema_snapshot: schema, answers: {},
  status: 'sent', token_expires_at: '2999-01-01T00:00:00Z', answered_at: null, reviewed_at: null, date_created: '2026-11-12T12:00:00Z', ...over,
});

describe('aba Anamneses da ficha', () => {
  const props = { patientId: '11111111-1111-4111-8111-111111111111', patientFirstName: 'Ana', patientPhone: '+5531999998888', archived: false, templates: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Clínica', own: false }] };

  it('gera o link e oferece copiar e WhatsApp', async () => {
    render(<PatientAnamneses {...props} anamneses={[]} />);
    fireEvent.change(screen.getByLabelText('Validade'), { target: { value: '14' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar link/ })));
    expect(sendAnamnesis).toHaveBeenCalledWith(props.patientId, props.templates[0]!.id, 14);
    expect((screen.getByLabelText('Link da anamnese') as HTMLInputElement).value).toBe('https://rafanutri.brunokobi.tech/r/abc');
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('https://wa.me/5531999998888?text=');
  });

  it('mostra as respostas e marca como revisada', async () => {
    render(<PatientAnamneses {...props} anamneses={[anamnesis({ status: 'answered', answers: { usa_med: true, meds: 'Metformina', sono: 4 }, answered_at: '2026-11-12T15:00:00Z' })]} />);
    // a respondida já abre
    expect(screen.getByText('Metformina')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Marcar como revisada/ })));
    expect(reviewAnamnesis).toHaveBeenCalled();
  });

  it('link vencido aparece como expirado e pode ser cancelado', () => {
    render(<PatientAnamneses {...props} anamneses={[anamnesis({ token_expires_at: '2020-01-01T00:00:00Z' })]} />);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Link expirado')).toBeTruthy();
    expect(within(item).getByRole('button', { name: /Cancelar link/ })).toBeTruthy();
  });

  it('paciente arquivado não recebe anamnese', () => {
    render(<PatientAnamneses {...props} archived anamneses={[]} />);
    expect(screen.queryByRole('button', { name: /Gerar link/ })).toBeNull();
  });
});

describe('respostas em leitura', () => {
  it('mostra só as perguntas visíveis, com o texto das opções', () => {
    render(<QuestionnaireAnswers schema={schema} answers={{ usa_med: false, sono: 3 }} />);
    expect(screen.getByText('Não')).toBeTruthy();
    expect(screen.queryByText('Quais?')).toBeNull();
  });
});

describe('editor: opções e WhatsApp', () => {
  it('opções mantêm o valor antigo (respostas antigas continuam válidas) e não repetem', () => {
    const prev = [{ value: 'sem_lactose', label: 'Sem lactose' }];
    expect(optionsFromLines('Sem lactose\nVegano\nVegano', prev)).toEqual([
      { value: 'sem_lactose', label: 'Sem lactose' },
      { value: 'vegano', label: 'Vegano' },
      { value: 'vegano_2', label: 'Vegano' },
    ]);
    expect(slug('Ação & Saúde!')).toBe('acao_saude');
  });
  it('WhatsApp sem telefone abre a escolha de contato', () => {
    expect(whatsappLink(null, 'Ana', 'https://x/r/1')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
