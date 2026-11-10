import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientsList } from '@/components/clinical/patients-list';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Pacientes', robots: { index: false } };

export default async function PatientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/pacientes');
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Pacientes</h1>
        <div className="mt-6">
          <PatientsList patientHref="/app/pacientes/exemplo" />
        </div>
      </main>
    </div>
  );
}
