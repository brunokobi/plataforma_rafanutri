import { AlertCircle, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ConversationList } from '@/components/messages/conversation-list';
import { InboxTitle } from '@/components/messages/inbox-title';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getConversations } from '@/lib/messages/actions';

export const metadata: Metadata = { title: 'Mensagens', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Caixa de mensagens dos pacientes. No computador, a lista fica à esquerda e a conversa à direita. */
export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/mensagens');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const data = await getConversations();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section aria-labelledby="inbox-title" className="flex min-h-0 flex-col lg:border-r lg:border-border">
          <InboxTitle enabled={data?.enabled ?? true} />
          {data ? <ConversationList initial={data.conversations} /> : (
            <div className="p-4"><Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as mensagens agora. Atualize a página em instantes.</AlertDescription></Alert></div>
          )}
        </section>
        <section className="chat-wallpaper hidden place-items-center lg:grid">
          <div className="max-w-sm rounded-2xl bg-background/90 p-6 text-center shadow-sm">
            <MessagesSquare className="mx-auto size-10 text-primary" aria-hidden="true" />
            <p className="mt-3 font-semibold">Escolha uma conversa</p>
            <p className="mt-1 text-sm text-muted-foreground">As mensagens chegam na hora enquanto a tela está aberta. Fora dela, você recebe um aviso no Telegram ou por e-mail se a mensagem ficar 5 minutos sem leitura.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
