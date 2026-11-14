'use client';

import { Pin } from 'lucide-react';
import { useState } from 'react';
import { groupForPatient } from '@/lib/recommendations/group';
import { markRecommendationRead } from '@/lib/recommendations/actions';
import type { PatientRecommendation } from '@/lib/recommendations/types';

/** Recomendações do paciente: fixadas primeiro, depois por categoria; abrir marca como lida. */
export function PatientRecommendationList({ list }: { list: PatientRecommendation[] }) {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(list.filter((r) => r.read_at).map((r) => r.id)));
  const { pinned, groups } = groupForPatient(list);

  function open(r: PatientRecommendation) {
    if (readIds.has(r.id)) return;
    setReadIds((s) => new Set(s).add(r.id));
    void markRecommendationRead(r.id);
  }

  const item = (r: PatientRecommendation) => (
    <li key={r.id}>
      <details className="group rounded-2xl border border-border bg-card" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) open(r); }}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 break-words font-medium">{r.title}</span>
          {!readIds.has(r.id) && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Nova</span>}
          <span aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </summary>
        <p className="whitespace-pre-line break-words px-4 pb-4 text-sm">{r.body}</p>
      </details>
    </li>
  );

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section aria-labelledby="rec-pinned" className="space-y-2">
          <h2 id="rec-pinned" className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><Pin className="size-4" aria-hidden="true" /> Fixadas</h2>
          <ul className="space-y-2">{pinned.map(item)}</ul>
        </section>
      )}
      {groups.map(([cat, rs]) => (
        <section key={cat} aria-label={cat} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{cat}</h2>
          <ul className="space-y-2">{rs.map(item)}</ul>
        </section>
      ))}
    </div>
  );
}
