import { MessagesToggle } from './messages-toggle';

/** Título da caixa de mensagens com o botão de receber/pausar. */
export function InboxTitle({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
      <h1 id="inbox-title" className="font-display text-2xl font-semibold tracking-tight">Mensagens</h1>
      <MessagesToggle enabled={enabled} />
    </div>
  );
}
