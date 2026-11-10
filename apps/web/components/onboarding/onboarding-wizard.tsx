'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Info, Loader2, Upload } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { completeOnboarding, type ActionResult } from '@/lib/auth/signup-actions';
import { cn } from '@/lib/utils';
import {
  BRAND_COLORS,
  CRN_REGIONS,
  PRACTICE_AREAS,
  SERVICE_MODES,
  STEP_FIELDS,
  onboardingSchema,
  validateLogo,
  type OnboardingInput,
} from '@/lib/validation/onboarding';
import { BrandPreview } from './brand-preview';

const STEPS = ['Seu perfil', 'Seu consultório', 'Como você atende', 'Revisão'];

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? <p id={id} className="text-sm text-destructive">{message}</p> : null;
}

export function OnboardingWizard({ defaultName, signupOpen }: { defaultName: string; signupOpen: boolean }) {
  const [step, setStep] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      professional_name: defaultName,
      crn: '',
      crn_region: '' as OnboardingInput['crn_region'],
      practice_name: '',
      practice_type: 'solo',
      brand_color: BRAND_COLORS[0],
      service_modes: [],
      areas: [],
    },
    mode: 'onTouched',
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });

  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }, [logoUrl]);

  async function next() {
    const ok = await form.trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    const error = validateLogo(file);
    setLogoError(error);
    if (error) return;
    setLogoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }

  const onSubmit = form.handleSubmit((data) => {
    setResult(null);
    startTransition(async () => {
      const r = await completeOnboarding(data);
      if (r) setResult(r);
    });
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={onSubmit} noValidate className="min-w-0">
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm">
            <p className="font-medium">
              Etapa {step + 1} de {STEPS.length}: <span className="text-primary">{STEPS[step]}</span>
            </p>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="mt-2" aria-label={`Etapa ${step + 1} de ${STEPS.length}`} />
          <ol className="mt-3 hidden gap-2 text-xs text-muted-foreground sm:flex">
            {STEPS.map((s, i) => (
              <li key={s} className={cn('flex items-center gap-1', i <= step && 'text-foreground')}>
                <span className={cn('grid size-5 place-items-center rounded-full border text-[10px]', i < step ? 'border-primary bg-primary text-primary-foreground' : i === step ? 'border-primary text-primary' : 'border-border')}>
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                {s}
                {i < STEPS.length - 1 && <span className="mx-1 text-border">—</span>}
              </li>
            ))}
          </ol>
        </div>

        {!signupOpen && (
          <Alert className="mb-6">
            <Info />
            <AlertTitle>Pré-lançamento</AlertTitle>
            <AlertDescription>Você pode configurar tudo para conhecer o fluxo, mas o consultório ainda não é salvo.</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <fieldset className="space-y-5">
            <legend className="sr-only">Seu perfil</legend>
            <div className="space-y-2">
              <Label htmlFor="professional_name">Nome profissional</Label>
              <Input id="professional_name" className="h-11" aria-invalid={Boolean(errors.professional_name)} aria-describedby="professional_name-error" {...form.register('professional_name')} />
              <p className="text-xs text-muted-foreground">É o nome que aparece nos PDFs e para os pacientes.</p>
              <FieldError id="professional_name-error" message={errors.professional_name?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-2">
                <Label htmlFor="crn">Número do CRN</Label>
                <Input id="crn" inputMode="numeric" placeholder="12345" className="h-11" aria-invalid={Boolean(errors.crn)} aria-describedby="crn-error" {...form.register('crn')} />
                <FieldError id="crn-error" message={errors.crn?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crn_region">Regional</Label>
                <select
                  id="crn_region"
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30"
                  aria-invalid={Boolean(errors.crn_region)}
                  aria-describedby="crn_region-error"
                  {...form.register('crn_region')}
                >
                  <option value="">Escolha</option>
                  {CRN_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <FieldError id="crn_region-error" message={errors.crn_region?.message} />
              </div>
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="space-y-6">
            <legend className="sr-only">Seu consultório</legend>
            <div className="space-y-2">
              <Label htmlFor="practice_name">Nome do consultório</Label>
              <Input id="practice_name" placeholder="Ex.: Ana Souza Nutrição" className="h-11" aria-invalid={Boolean(errors.practice_name)} aria-describedby="practice_name-error" {...form.register('practice_name')} />
              <FieldError id="practice_name-error" message={errors.practice_name?.message} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id="practice_type-label">Como você trabalha?</p>
              <Controller
                control={form.control}
                name="practice_type"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} aria-labelledby="practice_type-label" className="grid gap-3 sm:grid-cols-2">
                    {[
                      { v: 'solo', t: 'Atendo sozinho(a)', d: 'Consultório individual' },
                      { v: 'clinic', t: 'Clínica com equipe', d: 'Mais de um profissional (planos pagos)' },
                    ].map((o) => (
                      <Label key={o.v} htmlFor={`type-${o.v}`} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal', field.value === o.v ? 'border-primary bg-primary/5' : 'border-border')}>
                        <RadioGroupItem id={`type-${o.v}`} value={o.v} className="mt-0.5" />
                        <span>
                          <span className="block font-medium">{o.t}</span>
                          <span className="block text-xs text-muted-foreground">{o.d}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id="brand_color-label">Cor da marca</p>
              <Controller
                control={form.control}
                name="brand_color"
                render={({ field }) => (
                  <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="brand_color-label">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={field.value.toLowerCase() === c.toLowerCase()}
                        aria-label={`Cor ${c}`}
                        onClick={() => field.onChange(c)}
                        className={cn('size-9 rounded-full border-2 transition', field.value.toLowerCase() === c.toLowerCase() ? 'border-foreground scale-110' : 'border-transparent')}
                        style={{ background: c }}
                      />
                    ))}
                    <label className="ml-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                      Outra:
                      <input type="color" value={field.value} onChange={(e) => field.onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent" aria-label="Escolher outra cor" />
                    </label>
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">Logo (opcional)</Label>
              <label htmlFor="logo" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted/50">
                <Upload className="size-5" aria-hidden="true" />
                <span>{logoUrl ? 'Trocar imagem' : 'Escolher imagem PNG, JPG ou SVG (até 2 MB)'}</span>
              </label>
              <input id="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} aria-describedby="logo-error" />
              {logoError && <p id="logo-error" className="text-sm text-destructive">{logoError}</p>}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="space-y-6">
            <legend className="sr-only">Como você atende</legend>
            <div className="space-y-2">
              <p className="text-sm font-medium" id="modes-label">Modalidade de atendimento</p>
              <Controller
                control={form.control}
                name="service_modes"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-3" role="group" aria-labelledby="modes-label" aria-describedby="service_modes-error">
                    {SERVICE_MODES.map((m) => {
                      const checked = field.value.includes(m.value);
                      return (
                        <Label key={m.value} htmlFor={`mode-${m.value}`} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 font-normal', checked ? 'border-primary bg-primary/5' : 'border-border')}>
                          <Checkbox
                            id={`mode-${m.value}`}
                            checked={checked}
                            onCheckedChange={(v) => field.onChange(v ? [...field.value, m.value] : field.value.filter((x) => x !== m.value))}
                          />
                          {m.label}
                        </Label>
                      );
                    })}
                  </div>
                )}
              />
              <p className="text-xs text-muted-foreground">Marque as duas se você atende de forma híbrida.</p>
              <FieldError id="service_modes-error" message={errors.service_modes?.message} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id="areas-label">Áreas de atuação (opcional)</p>
              <Controller
                control={form.control}
                name="areas"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="areas-label">
                    {PRACTICE_AREAS.map((a) => {
                      const on = field.value.includes(a);
                      return (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={on}
                          onClick={() => field.onChange(on ? field.value.filter((x) => x !== a) : [...field.value, a])}
                          className={cn('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <dl className="divide-y divide-border rounded-xl border border-border text-sm">
              {[
                ['Nome profissional', values.professional_name],
                ['CRN', `${values.crn_region ?? ''} ${values.crn ?? ''}`],
                ['Consultório', values.practice_name],
                ['Tipo', values.practice_type === 'clinic' ? 'Clínica com equipe' : 'Consultório individual'],
                ['Atendimento', (values.service_modes ?? []).map((m) => SERVICE_MODES.find((s) => s.value === m)?.label).join(' e ')],
                ['Áreas', (values.areas ?? []).join(', ') || 'Não informado'],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-semibold">Plano Gratuito</p>
              <p className="text-muted-foreground">Até 20 pacientes ativos e 1 nutricionista, sem prazo e sem cartão.</p>
            </div>
            {result?.status === 'closed' && (
              <Alert>
                <Info />
                <AlertTitle>Tudo pronto, mas ainda em pré-lançamento</AlertTitle>
                <AlertDescription>Os dados estão válidos. O consultório será salvo quando o cadastro abrir; nada foi gravado agora.</AlertDescription>
              </Alert>
            )}
            {(result?.status === 'error' || result?.status === 'invalid') && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continuar <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? <><Loader2 className="size-4 animate-spin" /> Criando…</> : 'Criar meu consultório'}
            </Button>
          )}
        </div>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Como seus pacientes vão ver</p>
        <BrandPreview
          practiceName={values.practice_name ?? ''}
          professionalName={values.professional_name ?? ''}
          crn={values.crn ?? ''}
          crnRegion={values.crn_region ?? ''}
          color={values.brand_color ?? BRAND_COLORS[0]!}
          logoUrl={logoUrl}
        />
      </aside>
    </div>
  );
}
