import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TermsGate } from '@/components/legal/terms-gate';
import { ChatHeader } from '@/components/messages/chat-header';
import { ChatThread } from '@/components/messages/chat-thread';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getMyChat, sendMyMessage } from '@/lib/messages/actions';
import { patientContextId } from '@/lib/patient-area/context';
import { getPatientArea } from '@/lib/patient-area/actions';

export const metadata: Metadata = { title: 'Mensagens', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Conversa do paciente com o nutricionista, em tela cheia (como um app de mensagens). */
export default async function PatientMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/mensagens');
  const c = await patientContextId((await searchParams).c);
  const [area, chat] = await Promise.all([getPatientArea(), getMyChat(c)]);
  if (area && !area.patient_account) redirect('/app/mensagens');
  if (area && area.records.length === 0) redirect('/p');
  const record = area?.records.find((r) => r.patient_id === (chat?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';
  const title = chat?.professional ?? record?.professional.name ?? record?.practice.name ?? 'Seu nutricionista';
  const subtitle = chat?.professional && chat.practice ? chat.practice : record?.professional.crn ?? null;

  const header = (
    <ChatHeader
      back={`/p${q}`}
      title={title}
      subtitle={subtitle}
      avatar={record?.practice.has_logo && record.practice.id ? { src: `/api/consultorio/${record.practice.id}/logo` } : { initials: title }}
      color={record?.practice.brand_color ?? null}
    />
  );

  return (
    <div data-chat-screen className="flex h-dvh flex-col bg-background">
      <TermsGate profile="patient" />
      {chat ? (
        <ChatThread
          me="patient"
          initial={chat}
          fetchPage={getMyChat.bind(null, chat.patient_id)}
          send={sendMyMessage.bind(null, chat.patient_id)}
          header={header}
          accent={record?.practice.brand_color ?? null}
          blocked={chat.enabled ? null : 'O consultório não está recebendo mensagens pelo app no momento. Fale com ele pelos contatos de sempre.'}
          empty={<>Mande sua dúvida para {title}. A resposta aparece aqui e você recebe um aviso.<br /><span className="text-xs">Em caso de urgência, procure atendimento médico.</span></>}
        />
      ) : (
        <>
          {header}
          <div className="p-4">
            <Alert variant="destructive"><AlertDescription>Não foi possível abrir as mensagens agora. Atualize a página em instantes.</AlertDescription></Alert>
          </div>
        </>
      )}
    </div>
  );
}
