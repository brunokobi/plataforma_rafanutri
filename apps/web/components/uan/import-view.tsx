'use client';

import { Download, FileUp, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  csvOf,
  INGREDIENT_COLUMNS,
  parseCsv,
  SHEET_COLUMNS,
  SUPPLIER_COLUMNS,
  TEMPLATES,
  toRecords,
  validateIngredients,
  validateSheets,
  validateSuppliers,
  type ImportKind,
  type IngredientImport,
  type RowError,
  type SheetImport,
  type SupplierImport,
} from '@/lib/uan/import';
import { importIngredients, importSheets, importSuppliers, matchFoods, type ImportResult } from '@/lib/uan/import-actions';

const KINDS: Array<{ kind: ImportKind; label: string; hint: string }> = [
  { kind: 'fornecedores', label: 'Fornecedores', hint: 'Comece por eles: os insumos podem apontar o fornecedor pelo nome.' },
  { kind: 'insumos', label: 'Insumos', hint: 'Com unidade de compra, armazenamento, alergênicos, preço e o alimento da TACO (opcional; sem ele, a plataforma sugere pelo nome).' },
  { kind: 'fichas', label: 'Fichas técnicas', hint: 'Uma linha por ingrediente; as linhas com o mesmo nome de ficha formam uma ficha. Os insumos precisam estar cadastrados. Entram como rascunho.' },
];
type Parsed =
  | { kind: 'insumos'; valid: IngredientImport[]; errors: RowError[] }
  | { kind: 'fornecedores'; valid: SupplierImport[]; errors: RowError[] }
  | { kind: 'fichas'; valid: SheetImport[]; errors: RowError[] };

function save(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** RN-169 — Importação de planilhas: modelo, prévia com erros por linha, importação e relatório. */
export function ImportView({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [kind, setKind] = useState<ImportKind>('fornecedores');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [header, setHeader] = useState<{ unknown: string[]; missing: string[] } | null>(null);
  const [foods, setFoods] = useState<Map<string, string | null>>(new Map());
  const [useSuggestions, setUseSuggestions] = useState(true);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = (k: ImportKind) => { setKind(k); setParsed(null); setHeader(null); setResults(null); setError(null); setFoods(new Map()); };
  const onFile = async (file: File) => {
    setResults(null); setError(null); setParsed(null); setFoods(new Map());
    if (/\.xlsx?$/i.test(file.name)) return setError('Salve a planilha como CSV (no Excel: Arquivo › Salvar como › CSV) e envie de novo.');
    if (file.size > 5_000_000) return setError('Arquivo grande demais (máx. 5 MB).');
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError('A planilha está vazia.');
    if (rows.length > 1001) return setError('No máximo 1.000 linhas por importação; divida o arquivo.');
    const cols = kind === 'insumos' ? INGREDIENT_COLUMNS : kind === 'fornecedores' ? SUPPLIER_COLUMNS : SHEET_COLUMNS;
    const { records, unknown, missing } = toRecords(rows, cols);
    setHeader({ unknown, missing });
    if (missing.length) return;
    const p: Parsed = kind === 'insumos' ? { kind, ...validateIngredients(records) } : kind === 'fornecedores' ? { kind, ...validateSuppliers(records) } : { kind, ...validateSheets(records) };
    setParsed(p);
    if (p.kind === 'insumos') {
      startTransition(async () => {
        const names = p.valid.filter((v) => !v.taco).map((v) => v.name);
        const m = await matchFoods(orgId, names);
        setFoods(new Map(m.map((x) => [x.name, x.food?.name ?? null])));
      });
    }
  };
  const doImport = () =>
    startTransition(async () => {
      if (!parsed) return;
      setError(null);
      const r = parsed.kind === 'insumos' ? await importIngredients(orgId, parsed.valid, useSuggestions)
        : parsed.kind === 'fornecedores' ? await importSuppliers(orgId, parsed.valid) : await importSheets(orgId, parsed.valid);
      if (!r.ok) return setError(r.message);
      setResults(r.results);
    });
  const count = (s: ImportResult['status']) => results?.filter((x) => x.status === s).length ?? 0;
  const report = () => {
    const rows = [['linha', 'situação', 'motivo'], ...(parsed?.errors ?? []).map((e) => [String(e.line), 'erro na planilha', e.message]),
      ...(results ?? []).filter((r) => r.status !== 'created').map((r) => [String(r.line ?? ''), r.status === 'skipped' ? 'ignorada' : 'erro', r.message ?? ''])];
    save(`relatorio-importacao-${kind}.csv`, csvOf(rows));
  };
  const nValid = parsed?.valid.length ?? 0;

  return (
    <div className="space-y-6">
      <nav aria-label="O que importar" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => reset(k.kind)}
            className={cn('rounded-full border px-4 py-1.5 text-sm', kind === k.kind ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{k.label}</button>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{KINDS.find((k) => k.kind === kind)!.hint} Empresa: {orgName}.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => save(`modelo-${kind}.csv`, csvOf(TEMPLATES[kind]))}><Download className="size-4" /> Baixar modelo</Button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <FileUp className="size-4" /> Enviar planilha (CSV)
          <input type="file" accept=".csv,text/csv,.xlsx,.xls" className="sr-only" aria-label="Planilha CSV" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {header?.missing.length ? <p role="alert" className="text-sm text-destructive">Falta a coluna obrigatória: {header.missing.join(', ')}. Use o modelo.</p> : null}
      {header?.unknown.length ? <p className="text-sm text-amber-700 dark:text-amber-400">Colunas ignoradas: {header.unknown.join(', ')}.</p> : null}

      {parsed && !results && (
        <section aria-labelledby="previa" className="space-y-3">
          <h2 id="previa" className="font-display text-xl font-semibold">Prévia</h2>
          <p className="text-sm" role="status"><strong>{nValid}</strong> {parsed.kind === 'fichas' ? 'ficha(s)' : 'linha(s)'} pronta(s) para importar · <strong className={parsed.errors.length ? 'text-destructive' : ''}>{parsed.errors.length}</strong> com erro</p>
          {parsed.errors.length > 0 && (
            <ul aria-label="Erros da planilha" className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {parsed.errors.map((e, i) => <li key={i}>Linha {e.line}: {e.message}</li>)}
            </ul>
          )}
          {parsed.kind === 'insumos' && (
            <>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={useSuggestions} onChange={(e) => setUseSuggestions(e.target.checked)} /> Vincular à TACO pela sugestão quando a planilha não informar o alimento</label>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-sm" aria-label="Insumos a importar">
                  <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Linha</th><th className="p-2">Insumo</th><th className="p-2">Unidade</th><th className="p-2 text-right">Preço</th><th className="p-2">TACO</th></tr></thead>
                  <tbody>
                    {parsed.valid.slice(0, 100).map((v) => (
                      <tr key={v.line} className="border-b border-border/60">
                        <td className="p-2 text-muted-foreground">{v.line}</td><td className="p-2">{v.name}</td><td className="p-2">{v.purchase_unit}</td>
                        <td className="p-2 text-right">{v.price === null ? '—' : v.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td className="p-2 text-xs">{v.taco ? `informado: ${v.taco}` : foods.has(v.name) ? (foods.get(v.name) ? `sugerido: ${foods.get(v.name)}` : 'sem sugestão') : pending ? 'buscando…' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.valid.length > 100 && <p className="text-xs text-muted-foreground">Mostrando 100 de {parsed.valid.length}.</p>}
            </>
          )}
          {parsed.kind === 'fichas' && (
            <ul aria-label="Fichas a importar" className="space-y-1 text-sm">{parsed.valid.slice(0, 100).map((s) => <li key={s.name}>{s.name} · {s.servings} porções · {s.items.length} ingrediente(s)</li>)}</ul>
          )}
          {parsed.kind === 'fornecedores' && (
            <ul aria-label="Fornecedores a importar" className="space-y-1 text-sm">{parsed.valid.slice(0, 100).map((s) => <li key={s.line}>{s.name}{s.cnpj ? ` · CNPJ ${s.cnpj}` : ''}</li>)}</ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || nValid === 0} onClick={doImport}>{pending && <Loader2 className="size-4 animate-spin" />} Importar {nValid} {parsed.kind === 'fichas' ? 'ficha(s)' : 'linha(s)'}</Button>
            {parsed.errors.length > 0 && <Button type="button" variant="outline" onClick={report}><Download className="size-4" /> Relatório de erros</Button>}
          </div>
        </section>
      )}

      {results && (
        <section aria-labelledby="resultado" className="space-y-3">
          <h2 id="resultado" className="font-display text-xl font-semibold">Resultado</h2>
          <p role="status" className="text-sm"><strong>{count('created')}</strong> importada(s) · <strong>{count('skipped')}</strong> já existiam · <strong className={count('error') + (parsed?.errors.length ?? 0) ? 'text-destructive' : ''}>{count('error') + (parsed?.errors.length ?? 0)}</strong> com erro</p>
          {results.some((r) => r.status !== 'created') && (
            <ul aria-label="Linhas não importadas" className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-border p-3 text-sm">
              {results.filter((r) => r.status !== 'created').map((r, i) => <li key={i}>Linha {r.line ?? '—'}: {r.status === 'skipped' ? 'ignorada' : 'erro'} — {r.message}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={report}><Download className="size-4" /> Baixar relatório</Button>
            <Button type="button" variant="ghost" onClick={() => reset(kind)}>Importar outra planilha</Button>
          </div>
        </section>
      )}
    </div>
  );
}
