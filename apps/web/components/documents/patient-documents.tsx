'use client';

import { BookmarkPlus, EyeOff, FileDown, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDocument, createDocumentTemplate, deleteDocument, deleteDocumentTemplate, updateDocument } from '@/lib/documents/actions';
import { COMMON_EXAMS, DOCUMENT_KINDS, documentDefaults, KIND_LABEL, type ClinicalDocument, type DocumentInput, type DocumentKind, type DocumentResult, type DocumentTemplate } from '@/lib/documents/types';
import { dateBR } from '@/lib/format/date';

const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const inputOf = (d: ClinicalDocument): DocumentInput => ({ kind: d.kind, title: d.title, body: d.body, exams: d.exams, document_date: d.document_date });

/** RN-215 — Documentos clínicos do paciente: criar (do zero ou de um modelo), publicar, baixar o PDF. */
export function PatientDocuments({ patientId, patientName, list, templates, archived }: { patientId: string; patientName: string; list: ClinicalDocument[]; templates: DocumentTemplate[] | null; archived: boolean }) {
  const [mode, setMode] = useState<'none' | 'new' | { edit: ClinicalDocument }>('none');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<DocumentResult>, ok: string, close = true) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok && close) setMode('none');
    });
  }

  return (
    <section aria-labelledby="docs" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="docs" className="font-display text-xl font-semibold">Documentos</h2>
        {!archived && mode === 'none' && (
          <Button type="button" className="ml-auto" onClick={() => { setMode('new'); setFeedback(null); }}><Plus className="size-4" /> Novo documento</Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Pedido de exames, prescrição de suplementos, declaração de comparecimento e orientações, em PDF com a sua marca e espaço para assinatura. Rascunhos ficam só com você; publicados aparecem em &quot;Documentos&quot; na área do paciente.</p>
      {archived && <p className="text-sm text-muted-foreground">Paciente arquivado: reative para criar documentos.</p>}
      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}

      {mode === 'new' && (
        <DocumentForm patientName={patientName} templates={templates} pending={pending} onCancel={() => setMode('none')}
          onSubmit={(v, publish) => run(() => createDocument(patientId, v, publish), publish ? 'Documento publicado.' : 'Rascunho salvo.')}
          onSaveTemplate={(v) => run(() => createDocumentTemplate(patientId, { kind: v.kind, title: v.title, body: v.body, exams: v.exams }), 'Modelo salvo: use em outros pacientes.', false)}
          onDeleteTemplate={(t) => run(() => deleteDocumentTemplate(patientId, t.id), 'Modelo excluído.', false)} />
      )}
      {typeof mode === 'object' && (
        <DocumentForm initial={mode.edit} patientName={patientName} templates={templates} pending={pending} onCancel={() => setMode('none')}
          onSubmit={(v, publish) => run(() => updateDocument(patientId, mode.edit.id, { ...v, status: publish ? 'published' : 'draft' }), publish ? 'Documento publicado.' : 'Rascunho salvo.')}
          onSaveTemplate={(v) => run(() => createDocumentTemplate(patientId, { kind: v.kind, title: v.title, body: v.body, exams: v.exams }), 'Modelo salvo: use em outros pacientes.', false)}
          onDeleteTemplate={(t) => run(() => deleteDocumentTemplate(patientId, t.id), 'Modelo excluído.', false)} />
      )}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum documento ainda.</p>
      ) : (
        <ul className="space-y-3" aria-label="Documentos do paciente">
          {list.map((d) => (
            <li key={d.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[d.kind]}</p>
                  <p className="break-words font-semibold">{d.title}</p>
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">{dateBR(d.document_date)} · </span>
                    {d.status === 'draft' ? <span className="rounded-full bg-muted px-2 py-0.5">Rascunho</span> : <span className="text-primary">Publicado{d.published_at ? ` em ${dateBR(d.published_at)}` : ''}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <a href={`/app/pacientes/${patientId}/documentos/${d.id}/pdf`} download className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-muted" aria-label={`Baixar PDF: ${d.title}`}>
                    <FileDown className="size-4" aria-hidden="true" /> PDF
                  </a>
                  {!archived && (
                    <>
                      {d.status === 'draft' ? (
                        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateDocument(patientId, d.id, { ...inputOf(d), status: 'published' }), 'Documento publicado.')}><Send className="size-4" /> Publicar</Button>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateDocument(patientId, d.id, { ...inputOf(d), status: 'draft' }), 'Voltou para rascunho: o paciente não vê mais.')}><EyeOff className="size-4" /> Despublicar</Button>
                      )}
                      <Button type="button" size="sm" variant="ghost" disabled={pending || mode !== 'none'} aria-label={`Editar ${d.title}`} onClick={() => { setMode({ edit: d }); setFeedback(null); }}><Pencil className="size-4" /></Button>
                      <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Excluir ${d.title}`}
                        onClick={() => { if (window.confirm(`Excluir "${d.title}"? O paciente deixa de ver.`)) run(() => deleteDocument(patientId, d.id), 'Documento excluído.'); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentForm({ initial, patientName, templates, pending, onSubmit, onCancel, onSaveTemplate, onDeleteTemplate }: {
  initial?: ClinicalDocument;
  patientName: string;
  templates: DocumentTemplate[] | null;
  pending: boolean;
  onSubmit: (v: DocumentInput, publish: boolean) => void;
  onCancel: () => void;
  onSaveTemplate: (v: DocumentInput) => void;
  onDeleteTemplate: (t: DocumentTemplate) => void;
}) {
  const start = initial ? inputOf(initial) : { kind: 'exam_request' as DocumentKind, ...documentDefaults('exam_request', patientName, todayISO()), exams: [], document_date: todayISO() };
  const [kind, setKind] = useState<DocumentKind>(start.kind);
  const [title, setTitle] = useState(start.title);
  const [body, setBody] = useState(start.body);
  const [exams, setExams] = useState<string[]>(start.exams);
  const [date, setDate] = useState(start.document_date);
  const [other, setOther] = useState('');
  const value: DocumentInput = { kind, title, body, exams: kind === 'exam_request' ? exams : [], document_date: date };
  const kindTemplates = (templates ?? []).filter((t) => t.kind === kind);

  function changeKind(k: DocumentKind) {
    setKind(k);
    const d = documentDefaults(k, patientName, date);
    setTitle(d.title);
    setBody(d.body);
    setExams([]);
  }
  function applyTemplate(id: string) {
    const t = kindTemplates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setBody(t.body);
    setExams(t.exams);
  }
  const toggleExam = (e: string) => setExams((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]));
  function addOther() {
    const e = other.trim().replace(/\s+/g, ' ');
    if (e.length >= 2 && !exams.some((x) => x.toLowerCase() === e.toLowerCase())) setExams((l) => [...l, e]);
    setOther('');
  }
  const custom = exams.filter((e) => !(COMMON_EXAMS as readonly string[]).includes(e));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(value, true); }} aria-label={initial ? `Editar ${initial.title}` : 'Novo documento'} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="doc-kind">Tipo</Label>
          <select id="doc-kind" value={kind} disabled={Boolean(initial)} onChange={(e) => changeKind(e.target.value as DocumentKind)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-title">Título</Label>
          <Input id="doc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-date">Data do documento</Label>
          <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {templates !== null && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="doc-template">Usar modelo</Label>
            <select id="doc-template" value="" onChange={(e) => applyTemplate(e.target.value)} disabled={kindTemplates.length === 0} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{kindTemplates.length === 0 ? 'Nenhum modelo deste tipo ainda' : 'Escolha um modelo…'}</option>
              {kindTemplates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onSaveTemplate(value)}><BookmarkPlus className="size-4" /> Salvar como modelo</Button>
        </div>
      )}
      {kindTemplates.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Gerenciar modelos ({kindTemplates.length})</summary>
          <ul className="mt-2 space-y-1">
            {kindTemplates.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="flex-1">{t.title}</span>
                <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Excluir modelo ${t.title}`}
                  onClick={() => { if (window.confirm(`Excluir o modelo "${t.title}"?`)) onDeleteTemplate(t); }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {kind === 'exam_request' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Exames</legend>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {[...COMMON_EXAMS, ...custom].map((e) => (
              <label key={e} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={exams.includes(e)} onChange={() => toggleExam(e)} /> {e}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Input aria-label="Outro exame" placeholder="Outro exame" value={other} maxLength={120} onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} />
            <Button type="button" variant="outline" onClick={addOther} disabled={other.trim().length < 2}>Adicionar</Button>
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="doc-body">{kind === 'exam_request' ? 'Observações (opcional)' : kind === 'supplement_prescription' ? 'Prescrição (produto, dose e posologia)' : 'Texto'}</Label>
        <textarea id="doc-body" rows={kind === 'exam_request' ? 3 : 8} maxLength={6000} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        <p className="text-xs text-muted-foreground">Deixe uma linha em branco para separar parágrafos.</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="button" variant="outline" onClick={() => onSubmit(value, false)} disabled={pending}>Salvar rascunho</Button>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Publicar</Button>
      </div>
    </form>
  );
}
