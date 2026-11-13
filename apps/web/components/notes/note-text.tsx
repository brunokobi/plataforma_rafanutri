import { parseNote, type Inline } from '@/lib/notes/format';

function Line({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

/** Mostra a evolução com negrito e listas, sem interpretar HTML. */
export function NoteText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parseNote(text).map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((it, j) => <li key={j}><Line parts={it} /></li>)}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Line parts={l} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
