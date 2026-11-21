import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const askAssistant = vi.fn(async () => ({ ok: true as const, answer: '## Ideia\n\n| a | b |\n|---|---|\n| 1 | 2 |', model: 'x/y:free', used: 1, limit: 5 }));
vi.mock('@/lib/ai/actions', () => ({ askAssistant: (...a: unknown[]) => askAssistant(...(a as [])) }));
afterEach(cleanup);

describe('assistente de IA', () => {
  it('envia só o id do paciente e mostra a resposta em Markdown com aviso', async () => {
    const { Assistant } = await import('@/components/ai/assistant');
    render(<Assistant status={{ enabled: true, limit: 5, used: 0, plan: 'free' }} patients={[{ id: '00000000-0000-0000-0000-00000000000a', name: 'Maria' }]} initialPatient="00000000-0000-0000-0000-00000000000a" />);
    expect(screen.getByRole('tab', { name: 'Resumo da anamnese', selected: true })).toBeTruthy();
    expect(screen.getByText('5 de 5 pedidos hoje')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Pedir ao assistente/ })));
    expect(askAssistant).toHaveBeenCalledWith({ kind: 'anamnesis_summary', text: '', patient_id: '00000000-0000-0000-0000-00000000000a', kcal: null });
    expect(screen.getByRole('heading', { name: 'Ideia' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText(/a decisão é sua/)).toBeTruthy();
    expect(screen.getByText('4 de 5 pedidos hoje')).toBeTruthy();
  });

  it('pergunta livre não leva paciente', async () => {
    const { Assistant } = await import('@/components/ai/assistant');
    render(<Assistant status={{ enabled: true, limit: 200, used: 3, plan: 'clinic' }} patients={[]} initialPatient={null} />);
    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'Quanto de fibra por dia?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Pedir ao assistente/ })));
    expect(askAssistant).toHaveBeenLastCalledWith({ kind: 'question', text: 'Quanto de fibra por dia?', patient_id: null, kcal: null });
  });
});
