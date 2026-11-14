import { AlertCircle, Clock, Utensils } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { getPatientArea } from '@/lib/patient-area/actions';
import { mealOfTheMoment } from '@/lib/patient-area/meal-now';

export const metadata: Metadata = { title: 'Área do paciente', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PatientHome({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p');
  const area = await getPatientArea();
  if (area && !area.patient_account) {
    // Profissional não usa a área do paciente
    const orgs = await getMyOrganizations();
    redirect(orgs && orgs.length > 0 ? '/app' : '/onboarding');
  }
  const { c } = await searchParams;
  const records = area?.records ?? [];
  const record = records.find((r) => r.patient_id === c) ?? records[0] ?? null;

  if (!area) {
    return (
      <PatientShell practice={null}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Área do paciente</h1>
        <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar seus dados agora. Atualize a página em instantes.</AlertDescription></Alert>
      </PatientShell>
    );
  }
  if (!record) {
    return (
      <PatientShell practice={null}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{user.first_name ? `Olá, ${user.first_name}!` : 'Olá!'}</h1>
        <p className="text-muted-foreground">Sua conta não está ligada a nenhum nutricionista no momento. Se você recebeu um convite, abra o link de novo; se o acesso foi encerrado, fale com o seu nutricionista.</p>
      </PatientShell>
    );
  }

  const moment = record.plan ? mealOfTheMoment(record.plan.meals, new Date()) : null;
  return (
    <PatientShell practice={record.practice} professional={record.professional}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{record.first_name ? `Olá, ${record.first_name}!` : 'Olá!'}</h1>
      {records.length > 1 && (
        <nav aria-label="Seus nutricionistas" className="flex flex-wrap gap-2">
          {records.map((r) => (
            <Link key={r.patient_id} href={`/p?c=${r.patient_id}`} aria-current={r.patient_id === record.patient_id ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm aria-[current=page]:border-primary aria-[current=page]:bg-primary/10">
              {r.practice.name}
            </Link>
          ))}
        </nav>
      )}
      {!record.plan ? (
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Utensils className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Seu plano ainda não foi publicado</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assim que {record.professional.name ?? 'seu nutricionista'} publicar o plano alimentar, ele aparece aqui.</p>
        </section>
      ) : (
        <>
          {moment && (
            <section aria-labelledby="agora" className="rounded-2xl border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="size-4" aria-hidden="true" /> {moment.when === 'now' ? 'Agora' : 'Próxima refeição'}</p>
              <h2 id="agora" className="mt-1 font-display text-xl font-semibold">{moment.meal.name}{moment.meal.time ? ` · ${moment.meal.time}` : ''}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{moment.meal.items} {moment.meal.items === 1 ? 'item' : 'itens'} no seu plano</p>
            </section>
          )}
          <section aria-labelledby="plano" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="plano" className="font-semibold">{record.plan.title}</h2>
            {record.plan.published_at && <p className="text-sm text-muted-foreground">Publicado em {new Date(record.plan.published_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
            <ul className="mt-3 divide-y divide-border">
              {record.plan.meals.map((m) => (
                <li key={m.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground">{m.time ?? ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Os alimentos, as quantidades e as substituições de cada refeição chegam aqui em breve. Por enquanto, use o PDF que {record.professional.name ?? 'seu nutricionista'} enviou.</p>
          </section>
        </>
      )}
    </PatientShell>
  );
}
