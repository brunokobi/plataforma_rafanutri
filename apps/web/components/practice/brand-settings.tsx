'use client';

import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { removePracticeLogo, savePracticeColor, savePracticeTaxId, uploadPracticeLogo, type PracticeResult } from '@/lib/practice/actions';
import { Input } from '@/components/ui/input';
import { resizeLogo } from '@/lib/practice/resize-logo';
import { BRAND_COLORS } from '@/lib/validation/onboarding';

/** RN-204 — Logo e cor do consultório: aparecem na área do paciente e nos PDFs. Só o owner muda. */
export function BrandSettings({ orgId, name, color: initialColor, hasLogo, canEdit, taxId: initialTaxId = null }: { orgId: string; name: string; color: string | null; hasLogo: boolean; canEdit: boolean; taxId?: string | null }) {
  const [taxId, setTaxId] = useState(initialTaxId ?? '');
  const router = useRouter();
  const [color, setColor] = useState(initialColor ?? BRAND_COLORS[0]!);
  const [preview, setPreview] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const logoSrc = preview ?? (hasLogo ? `/api/consultorio/${orgId}/logo?v=${logoVersion}` : null);

  function run(fn: () => Promise<PracticeResult>, ok: string, after?: () => void) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    try {
      const data = await resizeLogo(file);
      setPreview(data);
      run(() => uploadPracticeLogo(orgId, data), 'Logo salvo.', () => setLogoVersion((v) => v + 1));
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível ler a imagem.' });
    }
  }

  return (
    <section aria-labelledby="brand" className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 id="brand" className="font-display text-xl font-semibold">Marca do consultório</h2>
        <p className="mt-1 text-sm text-muted-foreground">O logo e a cor aparecem na área do paciente, no plano alimentar e nos documentos em PDF.</p>
      </div>
      {!canEdit && <p className="text-sm text-muted-foreground">Só o responsável (owner) do consultório muda a marca.</p>}

      <div aria-label="Pré-visualização" className="overflow-hidden rounded-xl border border-border bg-white text-[#17241b]">
        <div className="h-1.5" style={{ background: color }} />
        <div className="flex items-center gap-3 p-4">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- rota privada / data URL local
            <img src={logoSrc} alt="Logo do consultório" className="size-12 rounded-lg bg-white object-contain p-1" />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: color }} aria-hidden="true">
              {name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
            </span>
          )}
          <p className="min-w-0 truncate font-semibold" style={{ color }}>{name}</p>
        </div>
      </div>

      {canEdit && (
        <>
          <div className="space-y-2">
            <Label htmlFor="practice-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="practice-logo" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {logoSrc ? 'Trocar logo' : 'Enviar logo'}
              </label>
              <input id="practice-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={pending}
                onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
              {(hasLogo || preview) && (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => removePracticeLogo(orgId), 'Logo removido.', () => setPreview(null))}>
                  <Trash2 className="size-4" /> Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou SVG. A imagem é reduzida para até 512 px antes de enviar.</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="practice-color-label">Cor da marca</p>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="practice-color-label">
              {BRAND_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color.toUpperCase() === c} aria-label={c} onClick={() => setColor(c)}
                  className="size-9 rounded-full border-2 border-transparent aria-checked:border-foreground" style={{ background: c }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent" aria-label="Escolher outra cor" />
            </div>
            <Button type="button" disabled={pending || color.toUpperCase() === (initialColor ?? '').toUpperCase()} onClick={() => run(() => savePracticeColor(orgId, color), 'Cor salva.')}>Salvar cor</Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-tax-id">CPF ou CNPJ no recibo (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="practice-tax-id" inputMode="numeric" className="max-w-60" placeholder="Só números" value={taxId} maxLength={18} onChange={(e) => setTaxId(e.target.value)} />
              <Button type="button" variant="outline" disabled={pending || taxId.replace(/\D/g, '') === (initialTaxId ?? '')} onClick={() => run(() => savePracticeTaxId(orgId, taxId), 'CPF/CNPJ do recibo salvo.')}>Salvar</Button>
            </div>
            <p className="text-xs text-muted-foreground">Sai no cabeçalho e na assinatura dos recibos do financeiro.</p>
          </div>
        </>
      )}
      {feedback && <p role="status" className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}
      {canEdit && <p className="text-sm"><a href="/app/configuracoes/pagina-publica" className="font-medium text-primary hover:underline">Página pública e agendamento online →</a></p>}
    </section>
  );
}
