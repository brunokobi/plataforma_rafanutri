import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { PatientDemoShell } from '@/components/clinical/patient-demo-shell';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Paciente de exemplo', robots: { index: false } };

export default async function DemoPatientLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/pacientes/exemplo/plano');
  return (
    <PatientDemoShell basePath="/app/pacientes/exemplo" backHref="/app">
      {children}
    </PatientDemoShell>
  );
}
