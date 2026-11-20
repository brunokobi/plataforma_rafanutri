import { TermsDialog } from '@/components/legal/terms-dialog';
import { getMyTerms } from '@/lib/legal/actions';
import { pendingDocuments, REQUIRED } from '@/lib/legal/info';

/** Pede o aceite da versão vigente dos documentos do perfil (uma vez por versão). */
export async function TermsGate({ profile }: { profile: 'professional' | 'patient' }) {
  const accepted = await getMyTerms();
  if (!accepted) return null;
  const pending = pendingDocuments(REQUIRED[profile], accepted);
  if (!pending.length) return null;
  const changed = accepted.some((a) => pending.includes(a.document as never));
  return <TermsDialog documents={pending} changed={changed} />;
}
