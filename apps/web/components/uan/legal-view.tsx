'use client';

import { Archive, CheckCircle2, Download, FileText, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CSV_KINDS } from '@/lib/uan/csv';
import { archiveLicense, createLicense } from '@/lib/uan/legal-actions';
import {
  defaultPeriod,
  LICENSE_KINDS,
  LICENSE_LABEL,
  licenseName,
  licenseStatus,
  type ExportRow,
  type IntegrityReport,
  type LicenseKind,
  type ManualData,
  type UnitLicenses,
} from '@/lib/uan/legal';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
const day = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const when = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function StatusBadge({ until, today }: { until: string | null; today: string }) {
  const st = licenseStatus(until, today);
  if (st === 'expired') return <Badge variant="destructive">Vencida</Badge>;
  if (st === 'expiring') return <Badge variant="secondary">Vence em breve</Badge>;
  if (st === 'valid') return <Badge variant="outline">Válida</Badge>;
  return <Badge variant="outline">Sem validade</Badge>;
}

/** Licenças e certificados da unidade (alvará, RT, pragas, reservatório…). */
export function LicensesSection({ data }: { data: UnitLicenses }) {
  const router = useRouter();
  const empty = { kind: 'sanitary_permit' as LicenseKind, title: '', number: '', issued_on: '', valid_until: '', provider: '', notes: '' };
  const [v, setV] = useState(empty);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const active = data.licenses.filter((l) => !l.archived);

  return (
    <section aria-labelledby="licencas" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="licencas" className="font-display text-xl font-semibold">Licenças e certificados</h2>
        {data.can_edit && !open && <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Registrar documento</Button>}
      </div>
      {active.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento registrado. Registre o alvará sanitário, o certificado do controle de pragas e a limpeza do reservatório.</p> : (
        <ul aria-label="Licenças" className="divide-y divide-border rounded-2xl border border-border bg-card">
          {active.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{licenseName(l)}</span>
                <span className="block text-xs text-muted-foreground">
                  {[l.number && `nº ${l.number}`, l.provider, l.issued_on && `emitido em ${day(l.issued_on)}`, l.valid_until && `válido até ${day(l.valid_until)}`].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge until={l.valid_until} today={data.today} />
                {data.can_edit && (
                  <Button type="button" size="sm" variant="ghost" aria-label={`Arquivar ${licenseName(l)}`} disabled={pending}
                    onClick={() => { if (window.confirm('Arquivar este documento? Ele sai da lista e do dossiê.')) startTransition(async () => { const r = await archiveLicense(data.unit.id, l.id); if (!r.ok) setMessage({ text: r.message, error: true }); router.refresh(); }); }}>
                    <Archive className="size-4" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form aria-label="Registrar documento" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setMessage(null);
              const r = await createLicense(data.unit.id, v);
              if (!r.ok) return setMessage({ text: r.message, error: true });
              setMessage({ text: 'Documento registrado.' });
              setV(empty);
              setOpen(false);
              router.refresh();
            });
          }}>
          <div className="space-y-1.5"><Label htmlFor="lic-kind">Tipo</Label>
            <select id="lic-kind" className={SELECT} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as LicenseKind })}>
              {LICENSE_KINDS.map((k) => <option key={k} value={k}>{LICENSE_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="lic-title">{v.kind === 'other' ? 'Nome do documento' : 'Descrição (opcional)'}</Label><Input id="lic-title" maxLength={160} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lic-number">Número</Label><Input id="lic-number" maxLength={80} value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lic-provider">Órgão ou empresa</Label><Input id="lic-provider" maxLength={160} value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lic-issued">Emissão</Label><Input id="lic-issued" type="date" value={v.issued_on} onChange={(e) => setV({ ...v, issued_on: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lic-until">Validade</Label><Input id="lic-until" type="date" value={v.valid_until} onChange={(e) => setV({ ...v, valid_until: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar documento</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </form>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
    </section>
  );
}

/** Manual de Boas Práticas: prévia, emissão de nova edição e edições anteriores. */
export function ManualSection({ data, unitId }: { data: ManualData; unitId: string }) {
  const router = useRouter();
  const pops = ['pop-higienizacao', 'pop-agua', 'pop-pragas', 'pop-manipuladores'];
  const missing = pops.filter((c) => !data.documents.some((d) => d.code === c)).length;
  const base = `/app/uan/unidades/${unitId}/fiscalizacao/manual`;
  return (
    <section aria-labelledby="manual" className="space-y-3">
      <h2 id="manual" className="font-display text-xl font-semibold">Manual de Boas Práticas</h2>
      <p className="text-sm text-muted-foreground">
        Gerado pelos itens da RDC 216/2004 com os dados da unidade, os equipamentos e as licenças, e com os {data.documents.length} documento(s) aprovado(s) como anexos.
        {missing > 0 && <strong className="text-amber-700 dark:text-amber-400"> Faltam {missing} dos 4 POPs obrigatórios aprovados.</strong>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><a href={`${base}?previa=1`}><FileText className="size-4" /> Prévia (PDF)</a></Button>
        {data.can_issue && (
          <Button asChild>
            <a href={base} onClick={() => setTimeout(() => router.refresh(), 4000)}><Download className="size-4" /> Emitir edição {(data.editions[0]?.edition ?? 0) + 1} (PDF)</a>
          </Button>
        )}
      </div>
      {!data.can_issue && <p className="text-xs text-muted-foreground">Quem emite o Manual é o RT da unidade ou o responsável pela empresa.</p>}
      {data.editions.length > 0 && (
        <ul aria-label="Edições do Manual" className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {data.editions.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 p-2.5">
              <span>Edição {e.edition} · {when(e.created_at)}{e.signed_name ? ` · ${e.signed_name}` : ''} · {e.documents} anexo(s)</span>
              {e.file_hash && <code className="text-xs text-muted-foreground" title={e.file_hash}>{e.file_hash.slice(0, 16)}…</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Dossiê do período (PDF) e emissões anteriores. */
export function DossierSection({ unitId, today, exports }: { unitId: string; today: string; exports: ExportRow[] }) {
  const router = useRouter();
  const [p, setP] = useState(defaultPeriod(today));
  const days = Math.round((Date.parse(`${p.to}T12:00:00Z`) - Date.parse(`${p.from}T12:00:00Z`)) / 86400e3);
  const invalid = !p.from || !p.to || days < 0 || days > 91;
  const dossiers = exports.filter((e) => e.kind === 'dossier');
  return (
    <section aria-labelledby="dossie" className="space-y-3">
      <h2 id="dossie" className="font-display text-xl font-semibold">Dossiê para a fiscalização</h2>
      <p className="text-sm text-muted-foreground">Um PDF com as licenças, os documentos vigentes, os treinamentos, os checklists, as temperaturas e as não conformidades do período, e a verificação de integridade dos registros.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="ds-from">De</Label><Input id="ds-from" type="date" value={p.from} max={p.to} onChange={(e) => setP({ ...p, from: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="ds-to">Até</Label><Input id="ds-to" type="date" value={p.to} max={today} onChange={(e) => setP({ ...p, to: e.target.value })} /></div>
        {invalid ? (
          <Button type="button" disabled>Gerar dossiê (PDF)</Button>
        ) : (
          <Button asChild><a href={`/app/uan/unidades/${unitId}/fiscalizacao/dossie?de=${p.from}&ate=${p.to}`} onClick={() => setTimeout(() => router.refresh(), 5000)}><Download className="size-4" /> Gerar dossiê (PDF)</a></Button>
        )}
      </div>
      {invalid && <p className="text-xs text-destructive">Escolha um período de até 92 dias.</p>}
      {!invalid && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">Planilhas (CSV):</span>
          {CSV_KINDS.map((k) => <a key={k.kind} className="font-medium text-primary underline" href={`/app/uan/unidades/${unitId}/fiscalizacao/csv?tipo=${k.kind}&de=${p.from}&ate=${p.to}`}>{k.label}</a>)}
        </p>
      )}
      {dossiers.length > 0 && (
        <ul aria-label="Dossiês emitidos" className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {dossiers.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 p-2.5">
              <span>{day(e.period_from)} a {day(e.period_to)} · gerado em {when(e.created_at)}{e.created_by_name ? ` por ${e.created_by_name}` : ''}</span>
              {e.integrity && <span className={e.integrity.divergent ? 'text-destructive' : 'text-muted-foreground'}>{e.integrity.divergent ? `${e.integrity.divergent} divergência(s)` : `${e.integrity.total} registro(s) íntegros`}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Verificação de integridade: hashes de checklists e documentos recalculados. */
export function IntegritySection({ report }: { report: IntegrityReport }) {
  const bad = report.rows.filter((r) => !r.ok);
  return (
    <section aria-labelledby="integridade" className="space-y-3">
      <h2 id="integridade" className="font-display text-xl font-semibold">Integridade dos registros</h2>
      {bad.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="size-4" aria-hidden="true" /> {report.total} registro(s) de {day(report.from)} a {day(report.to)} conferidos: nenhum conteúdo alterado.
        </p>
      ) : (
        <div role="alert" className="space-y-2 rounded-2xl border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive"><ShieldAlert className="size-4" aria-hidden="true" /> {bad.length} registro(s) com conteúdo diferente do registrado</p>
          <ul className="list-disc pl-5">{bad.map((r) => <li key={r.record_id}>{r.label} — {when(r.recorded_at)}</li>)}</ul>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Cada checklist concluído e cada versão aprovada de documento guarda um código SHA-256 do conteúdo. Registros de qualidade não podem ser apagados.</p>
    </section>
  );
}
