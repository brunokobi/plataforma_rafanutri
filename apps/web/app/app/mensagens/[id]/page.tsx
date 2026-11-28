import { ClipboardList } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ChatHeader } from '@/components/messages/chat-header';
import { ChatThread } from '@/components/messages/chat-thread';
import { ConversationList } from '@/components/messages/conversation-list';
import { InboxTitle } from '@/components/messages/inbox-title';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getConversations, getProChat, sendProMessage } from '@/lib/messages/actions';
import { isUuid } from '@/lib/validation/ids';

export const metadata: Metadata = { title: 'Conversa', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Conversa com um paciente. Celular: tela cheia. Computador: lista de conversas ao lado. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/mensagens/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const [chat, inbox] = await Promise.all([getProChat(id), getConversations()]);
  if (!chat) notFound();
  const p = chat.patient;
  const blocked = !p.active
    ? 'Paciente arquivado. Reative na ficha para conversar.'
    : !p.linked
      ? 'Este paciente ainda não entrou no app. Convide pela seção "App do paciente" da ficha; depois disso vocês conversam por aqui.'
      : null;

  return (
    <div data-chat-screen className="flex h-dvh flex-col">
      <AppHeader />
      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(320px,380px)_1fr]">
        <aside aria-label="Conversas" className="hidden min-h-0 flex-col border-r border-border lg:flex">
          <InboxTitle enabled={inbox?.enabled ?? true} />
          <ConversationList initial={inbox?.conversations ?? []} activeId={p.id} />
        </aside>
        <ChatThread
          me="professional"
          initial={chat}
          fetchPage={getProChat.bind(null, p.id)}
          send={sendProMessage.bind(null, p.id)}
          blocked={blocked}
          placeholder={`Mensagem para ${p.name.split(/\s+/)[0]}`}
          empty={<>Escreva para {p.name.split(/\s+/)[0]}. A mensagem aparece na área do paciente e, se não for lida em 5 minutos, vai um aviso pelo Telegram ou e-mail.</>}
          header={
            <ChatHeader
              back="/app/mensagens"
              backLabel="Voltar às conversas"
              backClassName="grid size-11 shrink-0 place-items-center rounded-full text-foreground/80 hover:bg-muted lg:hidden"
              title={p.name}
              subtitle={p.linked ? (p.active ? 'Paciente com acesso ao app' : 'Paciente arquivado') : 'Ainda sem acesso ao app'}
              avatar={{ initials: p.name }}
              actions={
                <Link href={`/app/pacientes/${p.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:bg-muted">
                  <ClipboardList className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Ficha</span><span className="sr-only sm:hidden">Abrir ficha</span>
                </Link>
              }
            />
          }
        />
      </div>
    </div>
  );
}
