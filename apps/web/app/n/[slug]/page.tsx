import { MapPin, Video } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicBooking } from '@/components/booking/public-booking';
import { getPublicPractice, getPublicSlots } from '@/lib/booking/actions';
import { formatCents } from '@/lib/finance/money';
import { JsonLd } from '@/components/seo/json-ld';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublicPractice((await params).slug);
  if (!p) return { title: 'Página não encontrada', robots: { index: false } };
  const slug = (await params).slug;
  return pageMetadata({ title: `${p.name} — agende sua consulta`, description: p.headline ?? `Nutrição com ${p.professional.name ?? p.name}.`, path: `/n/${slug}` });
}

const HEX = /^#[0-9a-f]{6}$/i;

/** RN-068 — Página pública do nutricionista com agendamento online. */
export default async function PublicPracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicPractice(slug);
  if (!p) notFound();
  const slots = p.booking_enabled ? await getPublicSlots(slug) : null;
  const color = p.brand_color && HEX.test(p.brand_color) ? p.brand_color : '#2E7D32';
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  return (
    <div className="min-h-dvh bg-background">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'MedicalBusiness',
        name: p.name,
        url: absoluteUrl(`/n/${slug}`),
        medicalSpecialty: 'https://schema.org/DietNutrition',
        ...(p.headline ? { description: p.headline } : {}),
        ...(p.city ? { address: { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: 'BR' } } : {}),
        ...(p.has_logo ? { logo: absoluteUrl(`/api/publico/${slug}/logo`) } : {}),
        ...(p.professional.name ? { employee: { '@type': 'Person', name: p.professional.name, jobTitle: 'Nutricionista' } } : {}),
      }} />
      <div className="h-2" style={{ background: color }} />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <header className="flex items-center gap-4">
          {p.has_logo && (
            // eslint-disable-next-line @next/next/no-img-element -- logo servido pela rota pública
            <img src={`/api/publico/${slug}/logo`} alt="" className="size-16 rounded-xl bg-white object-contain p-1.5 shadow-sm" />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold tracking-tight" style={{ color }}>{p.name}</h1>
            {p.professional.name && <p className="text-muted-foreground">{p.professional.name} · Nutricionista{p.professional.crn ? ` · ${p.professional.crn}` : ''}</p>}
          </div>
        </header>

        {(p.headline || p.bio) && (
          <section className="space-y-2">
            {p.headline && <p className="text-lg font-medium">{p.headline}</p>}
            {p.bio && <p className="whitespace-pre-line text-muted-foreground">{p.bio}</p>}
          </section>
        )}
        {p.specialties.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Especialidades">
            {p.specialties.map((s) => <li key={s} className="rounded-full border border-border px-3 py-1 text-sm">{s}</li>)}
          </ul>
        )}
        <section className="grid gap-3 sm:grid-cols-2" aria-label="Atendimento">
          {p.in_person && (
            <div className="flex gap-2 rounded-2xl border border-border p-4 text-sm"><MapPin className="size-5 shrink-0" style={{ color }} aria-hidden="true" />
              <div><p className="font-medium">Presencial</p><p className="text-muted-foreground">{[p.address, p.city].filter(Boolean).join(' · ') || 'Endereço informado na confirmação'}</p></div>
            </div>
          )}
          {p.online && (
            <div className="flex gap-2 rounded-2xl border border-border p-4 text-sm"><Video className="size-5 shrink-0" style={{ color }} aria-hidden="true" />
              <div><p className="font-medium">On-line</p><p className="text-muted-foreground">Por videochamada, de onde você estiver</p></div>
            </div>
          )}
          {(p.price_first_cents || p.price_return_cents) && (
            <div className="rounded-2xl border border-border p-4 text-sm sm:col-span-2">
              {p.price_first_cents && <p>Primeira consulta: <span className="font-semibold">{formatCents(p.price_first_cents)}</span></p>}
              {p.price_return_cents && <p>Retorno: <span className="font-semibold">{formatCents(p.price_return_cents)}</span></p>}
            </div>
          )}
        </section>

        {p.booking_enabled && (
          <section aria-labelledby="agendar" className="space-y-4">
            <h2 id="agendar" className="font-display text-2xl font-semibold">Agende sua consulta</h2>
            {slots ? (
              <PublicBooking slug={slug} initial={slots} today={today} inPerson={p.in_person} online={p.online} requireApproval={p.require_approval} color={color} />
            ) : (
              <p className="text-sm text-muted-foreground">Não foi possível carregar os horários agora. Atualize a página em instantes.</p>
            )}
          </section>
        )}
        <footer className="pt-6 text-center text-xs text-muted-foreground">Página feita com Rafanutri</footer>
      </main>
    </div>
  );
}
