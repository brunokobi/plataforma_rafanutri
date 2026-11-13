import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendGuideline } from '@/components/clinical/meal-plan-editor';
import { filterSnippets, SnippetPicker } from '@/components/snippets/snippet-picker';
import { groupByCategory, SnippetsManager } from '@/components/snippets/snippets-manager';
import type { Snippet } from '@/lib/snippets/actions';

const LIST: Snippet[] = [
  { id: 'a', category: 'Hidratação', title: 'Água ao longo do dia', body: 'Beba água ao longo do dia.', own: true },
  { id: 'b', category: 'Intestino', title: 'Fibras', body: 'Inclua frutas com casca.', own: true },
  { id: 'c', category: 'Hidratação', title: 'Garrafinha', body: 'Leve uma garrafinha.', own: false },
];
type R = { ok: true; id?: string } | { ok: false; message: string; fields?: Record<string, string> };
const listSnippets = vi.fn(async (): Promise<Snippet[] | null> => LIST);
const saveSnippet = vi.fn(async (_i: unknown, _id?: string): Promise<R> => ({ ok: true, id: 'n' }));
const deleteSnippet = vi.fn(async (_id: string): Promise<R> => ({ ok: true }));
vi.mock('@/lib/snippets/actions', () => ({
  listSnippets: () => listSnippets(),
  saveSnippet: (i: unknown, id?: string) => saveSnippet(i, id),
  deleteSnippet: (id: string) => deleteSnippet(id),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('funções puras', () => {
  it('filtra sem acento por título, categoria ou texto', () => {
    expect(filterSnippets(LIST, 'hidratacao').map((s) => s.id)).toEqual(['a', 'c']);
    expect(filterSnippets(LIST, 'CASCA').map((s) => s.id)).toEqual(['b']);
    expect(filterSnippets(LIST, '  ')).toHaveLength(3);
  });
  it('agrupa por categoria em ordem alfabética', () => {
    expect(groupByCategory(LIST).map(([c, i]) => [c, i.length])).toEqual([['Hidratação', 2], ['Intestino', 1]]);
  });
  it('acrescenta a orientação como nova linha', () => {
    expect(appendGuideline('', ' Beba água. ')).toBe('Beba água.');
    expect(appendGuideline('Linha 1\n\n', 'Linha 2')).toBe('Linha 1\nLinha 2');
  });
});

describe('SnippetPicker', () => {
  it('carrega ao abrir, busca e insere com Enter', async () => {
    const onPick = vi.fn();
    render(<SnippetPicker onPick={onPick} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Inserir orientação/ })));
    expect(listSnippets).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Fibras')).toBeTruthy();
    const box = screen.getByLabelText('Buscar orientação');
    fireEvent.change(box, { target: { value: 'garraf' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(LIST[2]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('abre pelo sinal do atalho "/"', async () => {
    const { rerender } = render(<SnippetPicker onPick={vi.fn()} openSignal={0} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => rerender(<SnippetPicker onPick={vi.fn()} openSignal={1} />));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('mostra erro quando não carrega', async () => {
    listSnippets.mockResolvedValueOnce(null);
    render(<SnippetPicker onPick={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Inserir orientação/ })));
    expect(await screen.findByText(/Não foi possível carregar/)).toBeTruthy();
  });
});

describe('SnippetsManager', () => {
  it('agrupa, marca a biblioteca e só deixa editar as próprias', () => {
    render(<SnippetsManager snippets={LIST} />);
    expect(screen.getByRole('heading', { name: 'Hidratação' })).toBeTruthy();
    expect(screen.getByText('Biblioteca')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Editar/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Apagar Garrafinha' })).toBeNull();
  });
  it('cria uma orientação e mostra erros de campo', async () => {
    saveSnippet.mockResolvedValueOnce({ ok: false, message: 'Confira os campos.', fields: { title: 'Título muito curto' } });
    render(<SnippetsManager snippets={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova orientação/ }));
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Sono' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText(/Texto/), { target: { value: 'Durma 8 horas.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ })));
    expect(screen.getByText('Título muito curto')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Dormir bem' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ })));
    expect(saveSnippet).toHaveBeenLastCalledWith({ category: 'Sono', title: 'Dormir bem', body: 'Durma 8 horas.' }, undefined);
    expect(refresh).toHaveBeenCalled();
  });
  it('apaga após confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SnippetsManager snippets={LIST} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apagar Fibras' })));
    expect(deleteSnippet).toHaveBeenCalledWith('b');
  });
});
