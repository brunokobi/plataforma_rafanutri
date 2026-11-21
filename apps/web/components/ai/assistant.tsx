'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { askAssistant, type AiKind, type AiStatus } from '@/lib/ai/actions';

const TABS: Array<{ kind: AiKind; label: string; hint: string; placeholder: string; patient: 'none' | 'required' | 'optional' }> = [
  { kind: 'question', label: 'Perguntar', hint: 'Dúvidas sobre condutas, diretrizes, alimentos e nutrientes.', placeholder: 'Ex.: Qual a recomendação de fibras para adultos com constipação?', patient: 'none' },
  { kind: 'recipes', label: 'Ideias de receitas', hint: 'Diga a refeição, os ingredientes ou as restrições.', placeholder: 'Ex.: café da manhã sem glúten com até 300 kcal', patient: 'none' },
  { kind: 'anamnesis_summary', label: 'Resumo da anamnese', hint: 'Resume a última anamnese respondida do paciente e aponta pontos de atenção.', placeholder: 'Observação opcional (ex.: foco em sintomas gastrointestinais)', patient: 'required' },
  { kind: 'plan_suggestion', label: 'Sugestão de cardápio', hint: 'Cardápio de 1 dia para a meta de calorias; com paciente, considera a anamnese e as medidas.', placeholder: 'Preferências e restrições (ex.: vegetariano, não gosta de peixe)', patient: 'optional' },
];

export function Assistant({ status, patients, initialPatient }: { status: AiStatus; patients: Array<{ id: string; name: string }>; initialPatient: string | null }) {
  const [tab, setTab] = useState<AiKind>(initialPatient ? 'anamnesis_summary' : 'question');
  const [text, setText] = useState('');
  const [patient, setPatient] = useState(initialPatient ?? '');
  const [kcal, setKcal] = useState('1800');
  const [answer, setAnswer] = useState<{ text: string; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(status.used);
  const [pending, start] = useTransition();
  const current = TABS.find((t) => t.kind === tab)!;
  const left = Math.max(0, status.limit - used);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await askAssistant({ kind: tab, text, patient_id: current.patient === 'none' ? null : patient || null, kcal: tab === 'plan_suggestion' ? Number(kcal) : null });
      if (!r.ok) return setError(r.message);
      setAnswer({ text: r.answer, model: r.model });
      setUsed(r.used);
    });
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Tipo de pedido" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.kind} type="button" role="tab" aria-selected={t.kind === tab} onClick={() => { setTab(t.kind); setAnswer(null); setError(null); }}
            className={`rounded-full border px-3 py-1.5 text-sm ${t.kind === tab ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">{current.hint}</p>
        {current.patient !== 'none' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1">
              <Label htmlFor="ai-patient">Paciente{current.patient === 'optional' ? ' (opcional)' : ''}</Label>
              <select id="ai-patient" value={patient} onChange={(e) => setPatient(e.target.value)} required={current.patient === 'required'} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">{current.patient === 'required' ? 'Escolha…' : 'Sem paciente'}</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {tab === 'plan_suggestion' && (
              <div className="space-y-1"><Label htmlFor="ai-kcal">Meta (kcal)</Label><Input id="ai-kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ''))} required /></div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="ai-text">{tab === 'question' ? 'Pergunta' : tab === 'recipes' ? 'Pedido' : 'Observações'}</Label>
          <textarea id="ai-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={current.placeholder} rows={3} maxLength={2000} required={tab === 'question' || tab === 'recipes'} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || left === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending ? 'Pensando… (pode levar até 1 minuto)' : 'Pedir ao assistente'}
          </Button>
          <span className="text-xs text-muted-foreground">{status.limit <= 5 ? `${left} de ${status.limit} pedidos hoje` : `${used} pedidos hoje`}</span>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>

      {answer && (
        <article aria-label="Resposta do assistente" className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer.text}</ReactMarkdown>
          </div>
          <p className="border-t pt-2 text-xs text-muted-foreground">Sugestão gerada por IA ({answer.model.replace(/:free$/, '')}). Confira antes de usar: a decisão é sua.</p>
        </article>
      )}
    </div>
  );
}
