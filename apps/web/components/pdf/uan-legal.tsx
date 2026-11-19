import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { parseMarkdown, type MdInline } from '@/lib/uan/documents';
import { licenseName, licenseStatus, manualSections, type DossierData, type ManualData } from '@/lib/uan/legal';

// Sem hifenização automática (as regras embutidas são do inglês e quebram mal o português).
Font.registerHyphenationCallback((word) => [word]);

const GREEN = '#2f7a3d';
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: '#17241b', lineHeight: 1.45 },
  cover: { paddingTop: 160, paddingHorizontal: 56, fontFamily: 'Helvetica', color: '#17241b' },
  coverKind: { fontSize: 11, letterSpacing: 2, color: GREEN, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', marginTop: 10, lineHeight: 1.2 },
  coverUnit: { fontSize: 15, marginTop: 14 },
  coverMeta: { marginTop: 40, fontSize: 10.5, gap: 3 },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: GREEN, marginBottom: 8 },
  h2: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 2 },
  p: { marginBottom: 5, textAlign: 'justify' },
  quote: { borderLeftWidth: 3, borderLeftColor: '#d39b2a', backgroundColor: '#fbf4e3', padding: 6, marginBottom: 6 },
  li: { flexDirection: 'row', marginBottom: 2 },
  bullet: { width: 14 },
  strong: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6a60', fontSize: 8.5 },
  tocRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: '#dde3dc', paddingVertical: 3, fontSize: 10.5 },
  table: { borderTopWidth: 0.5, borderTopColor: '#c8d0c8', marginBottom: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#dde3dc', paddingVertical: 2.5 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3d4b42' },
  td: { fontSize: 8.5, paddingRight: 4 },
  bad: { color: '#b3261e', fontFamily: 'Helvetica-Bold' },
  section: { marginBottom: 14 },
  signature: { marginTop: 48, alignItems: 'center' },
  line: { width: 260, borderTopWidth: 1, borderTopColor: '#17241b', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, fontSize: 7.5, color: '#5b6a60', flexDirection: 'row', justifyContent: 'space-between' },
  hash: { fontFamily: 'Courier', fontSize: 7 },
});

const dmy = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pdfDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function Inline({ parts }: { parts: MdInline[] }) {
  return <>{parts.map((p, i) => <Text key={i} style={p.bold ? s.strong : undefined}>{p.text}</Text>)}</>;
}

/** Markdown simples (o mesmo do editor de documentos) desenhado no PDF. */
export function PdfMarkdown({ md }: { md: string }) {
  return (
    <View>
      {parseMarkdown(md).map((b, i) => {
        switch (b.kind) {
          case 'h1': return <Text key={i} style={s.h2}><Inline parts={b.inline} /></Text>;
          case 'h2': return <Text key={i} style={s.h2}><Inline parts={b.inline} /></Text>;
          case 'h3': return <Text key={i} style={s.h3}><Inline parts={b.inline} /></Text>;
          case 'quote': return <View key={i} style={s.quote}><Text><Inline parts={b.inline} /></Text></View>;
          case 'ul':
          case 'ol':
            return (
              <View key={i} style={{ marginBottom: 5 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={s.li} wrap={false}>
                    <Text style={s.bullet}>{b.kind === 'ol' ? `${j + 1}.` : '•'}</Text>
                    <Text style={{ flex: 1 }}><Inline parts={it} /></Text>
                  </View>
                ))}
              </View>
            );
          default: return <Text key={i} style={s.p}><Inline parts={b.inline} /></Text>;
        }
      })}
    </View>
  );
}

function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Table({ cols, rows }: { cols: Array<{ label: string; w: number }>; rows: Array<Array<string | { text: string; bad?: boolean }>> }) {
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>{cols.map((c, i) => <Text key={i} style={[s.th, { width: `${c.w}%` }]}>{c.label}</Text>)}</View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {r.map((cell, j) => {
            const c = typeof cell === 'string' ? { text: cell } : cell;
            return <Text key={j} style={[s.td, { width: `${cols[j]!.w}%` }, c.bad ? s.bad : {}]}>{c.text}</Text>;
          })}
        </View>
      ))}
      {rows.length === 0 && <Text style={[s.td, { paddingVertical: 3 }]}>Nenhum registro no período.</Text>}
    </View>
  );
}

/** RN-157 — Manual de Boas Práticas: capa, sumário, seções da RDC 216, POPs aprovados como anexos e assinatura. */
export function ManualPdf({ data, edition, today, signer }: { data: ManualData; edition: number; today: string; signer: string }) {
  const sections = manualSections(data, today);
  const footer = `Manual de Boas Práticas — ${data.unit.name} — edição ${edition}`;
  return (
    <Document title={`Manual de Boas Práticas — ${data.unit.name}`} author={signer} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.cover}>
        <Text style={s.coverKind}>MANUAL DE BOAS PRÁTICAS</Text>
        <Text style={s.coverTitle}>{data.unit.name}</Text>
        {data.organization && <Text style={s.coverUnit}>{data.organization}</Text>}
        <View style={s.coverMeta}>
          <Text>Edição {edition} · emitida em {dmy(today)}</Text>
          <Text>Responsável técnico: {data.technical_lead ?? 'não definido'}</Text>
          <Text>Base legal: RDC Anvisa nº 216/2004</Text>
          <Text>{data.documents.length} documento(s) anexo(s)</Text>
        </View>
        <Footer left={footer} />
      </Page>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Sumário</Text>
        {sections.map((sec) => <View key={sec.title} style={s.tocRow}><Text>{sec.title}</Text></View>)}
        {data.documents.map((d, i) => <View key={d.id} style={s.tocRow}><Text>Anexo {String.fromCharCode(65 + i)} — {d.title} (v{d.version})</Text></View>)}
        <Footer left={footer} />
      </Page>
      <Page size="A4" style={s.page}>
        {sections.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.h1} minPresenceAhead={60}>{sec.title}</Text>
            <PdfMarkdown md={sec.body} />
          </View>
        ))}
        <View style={s.signature} wrap={false}>
          <View style={s.line} />
          <Text style={s.strong}>{signer}</Text>
          <Text style={s.muted}>Responsável — emitido em {dmy(today)}</Text>
        </View>
        <Footer left={footer} />
      </Page>
      {data.documents.map((d, i) => (
        <Page key={d.id} size="A4" style={s.page}>
          <Text style={s.h1}>Anexo {String.fromCharCode(65 + i)} — {d.title}</Text>
          <Text style={s.muted}>Versão {d.version} · aprovada em {pdfDate(d.approved_at)}{d.approved_by_name ? ` por ${d.approved_by_name}` : ''} · revisar até {dmy(d.next_review_on)}</Text>
          <Text style={[s.hash, { marginBottom: 10 }]}>SHA-256: {d.content_hash}</Text>
          <PdfMarkdown md={d.body_md ?? ''} />
          <Footer left={footer} />
        </Page>
      ))}
    </Document>
  );
}

const SEVERITY: Record<string, string> = { low: 'baixa', medium: 'média', high: 'alta', critical: 'crítica' };
const NC_STATUS: Record<string, string> = { open: 'aberta', in_progress: 'em tratamento', resolved: 'resolvida', closed: 'fechada' };

/** RN-166 — Dossiê para a fiscalização: identificação, licenças, documentos vigentes, treinamentos, checklists,
    temperaturas, não conformidades e verificação de integridade do período. */
export function DossierPdf({ data, today }: { data: DossierData; today: string }) {
  const u = data.unit;
  const footer = `Dossiê — ${u.name} — ${dmy(data.period.from)} a ${dmy(data.period.to)}`;
  const parts = ['1. Identificação e licenças', '2. Documentos vigentes (Manual e POPs)', '3. Treinamentos', '4. Checklists de Boas Práticas', '5. Registros de temperatura', '6. Não conformidades e ações corretivas', '7. Verificação de integridade', 'Anexos: textos dos documentos vigentes'];
  return (
    <Document title={`Dossiê — ${u.name}`} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.cover}>
        <Text style={s.coverKind}>DOSSIÊ PARA A FISCALIZAÇÃO SANITÁRIA</Text>
        <Text style={s.coverTitle}>{u.name}</Text>
        {data.organization && <Text style={s.coverUnit}>{data.organization}</Text>}
        <View style={s.coverMeta}>
          <Text>Período: {dmy(data.period.from)} a {dmy(data.period.to)}</Text>
          <Text>Gerado em {dt(data.generated_at)}</Text>
          <Text>Responsável técnico: {data.technical_lead ?? 'não definido'}</Text>
          <Text>Integridade: {data.integrity.divergent === 0 ? `${data.integrity.total} registro(s) conferido(s), nenhuma divergência` : `${data.integrity.divergent} divergência(s) em ${data.integrity.total} registro(s)`}</Text>
          {data.truncated && <Text style={s.bad}>Período com registros demais: parte foi omitida. Gere períodos menores.</Text>}
        </View>
        <View style={{ marginTop: 36 }}>
          <Text style={s.h2}>Índice</Text>
          {parts.map((p) => <View key={p} style={s.tocRow}><Text>{p}</Text></View>)}
        </View>
        <Footer left={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>1. Identificação e licenças</Text>
        <Text>
          <Text style={s.strong}>Unidade:</Text> {u.name}{u.cnpj ? ` · CNPJ ${u.cnpj}` : ''}
        </Text>
        <Text><Text style={s.strong}>Endereço:</Text> {[u.address, u.city, u.state].filter(Boolean).join(', ') || '—'}</Text>
        <Text style={{ marginBottom: 8 }}><Text style={s.strong}>Responsável técnico:</Text> {data.technical_lead ?? '—'}</Text>
        <Table
          cols={[{ label: 'Documento', w: 38 }, { label: 'Número', w: 18 }, { label: 'Emissão', w: 14 }, { label: 'Validade', w: 14 }, { label: 'Situação', w: 16 }]}
          rows={[
            ...(u.sanitary_license ? [[ 'Licença sanitária (cadastro da unidade)', u.sanitary_license, '—', dmy(u.sanitary_license_expires_at), statusCell(u.sanitary_license_expires_at, today) ]] : []),
            ...data.licenses.map((l) => [licenseName(l), l.number ?? '—', dmy(l.issued_on), dmy(l.valid_until), statusCell(l.valid_until, today)]),
          ]}
        />

        <Text style={[s.h1, { marginTop: 10 }]}>2. Documentos vigentes</Text>
        <Table
          cols={[{ label: 'Documento', w: 40 }, { label: 'Versão', w: 9 }, { label: 'Aprovação', w: 21 }, { label: 'Revisar até', w: 14 }, { label: 'Anexo', w: 16 }]}
          rows={[
            ...(data.manual ? [[`Manual de Boas Práticas (edição ${data.manual.edition})`, String(data.manual.edition), `${pdfDate(data.manual.created_at)}${data.manual.signed_name ? ` · ${data.manual.signed_name}` : ''}`, '—', 'emitido à parte']] : []),
            ...data.documents.map((d, i) => [d.title, String(d.version), `${pdfDate(d.approved_at)}${d.approved_by_name ? ` · ${d.approved_by_name}` : ''}`,
              { text: dmy(d.next_review_on), bad: Boolean(d.next_review_on && d.next_review_on < today) }, `Anexo ${String.fromCharCode(65 + i)}`]),
          ]}
        />
        {!data.manual && <Text style={s.muted}>O Manual de Boas Práticas ainda não foi emitido pela plataforma.</Text>}

        <Text style={[s.h1, { marginTop: 10 }]} minPresenceAhead={40}>3. Treinamentos</Text>
        <Table
          cols={[{ label: 'Data', w: 12 }, { label: 'Tema', w: 30 }, { label: 'Carga', w: 8 }, { label: 'Instrutor', w: 18 }, { label: 'Participantes', w: 32 }]}
          rows={data.trainings.map((t) => [dmy(t.held_on), t.topic, `${t.hours.toLocaleString('pt-BR')} h`, t.instructor ?? '—', t.attendees.join(', ')])}
        />
        <Footer left={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>4. Checklists de Boas Práticas</Text>
        <Table
          cols={[{ label: 'Concluído em', w: 17 }, { label: 'Checklist', w: 27 }, { label: 'Pontuação', w: 11 }, { label: 'C / NC / NA', w: 12 }, { label: 'Responsável', w: 17 }, { label: 'Hash', w: 16 }]}
          rows={data.checklists.map((c) => [dt(c.completed_at), c.template_name, c.score === null ? '—' : `${c.score.toLocaleString('pt-BR')}%`, `${c.conform} / ${c.non_conform} / ${c.na}`, c.completed_by ?? '—', c.content_hash ? c.content_hash.slice(0, 12) + '…' : '—'])}
        />
        {data.checklists.some((c) => c.failures.length) && (
          <>
            <Text style={s.h2}>Itens não conformes</Text>
            <Table
              cols={[{ label: 'Checklist', w: 28 }, { label: 'Item', w: 42 }, { label: 'Observação', w: 30 }]}
              rows={data.checklists.flatMap((c) => c.failures.map((f) => [`${c.template_name} (${dt(c.completed_at)})`, { text: `${f.critical ? '[crítico] ' : ''}${f.prompt}`, bad: f.critical },
                [f.value !== null ? `${f.value.toLocaleString('pt-BR')}${f.unit ? ` ${f.unit}` : ''}` : null, f.comment].filter(Boolean).join(' — ') || '—']))}
            />
          </>
        )}
        <Footer left={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>5. Registros de temperatura</Text>
        <Table
          cols={[{ label: 'Data e hora', w: 17 }, { label: 'Equipamento ou alimento', w: 27 }, { label: 'Valor', w: 9 }, { label: 'Limite', w: 13 }, { label: 'Ação corretiva', w: 22 }, { label: 'Por', w: 12 }]}
          rows={data.temperatures.map((t) => [dt(t.recorded_at), t.target, { text: `${t.value.toLocaleString('pt-BR')} °C`, bad: t.out_of_range },
            t.min !== null && t.max !== null ? `${t.min} a ${t.max} °C` : t.max !== null ? `até ${t.max} °C` : t.min !== null ? `mín. ${t.min} °C` : '—', t.corrective_action ?? '', t.by ?? '—'])}
        />
        <Footer left={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>6. Não conformidades e ações corretivas</Text>
        <Table
          cols={[{ label: 'Aberta em', w: 14 }, { label: 'Não conformidade', w: 32 }, { label: 'Gravidade', w: 10 }, { label: 'Prazo', w: 12 }, { label: 'Situação', w: 12 }, { label: 'Fechamento', w: 20 }]}
          rows={data.non_conformities.map((n) => [dmy(n.opened_at), `${n.title}${n.plans ? ` (${n.plans} plano(s) de ação)` : ''}`, SEVERITY[n.severity] ?? n.severity, dmy(n.due_at),
            { text: NC_STATUS[n.status] ?? n.status, bad: n.status !== 'closed' && n.due_at.slice(0, 10) < today }, n.closed_at ? `${dmy(n.closed_at)}${n.closing_note ? ` — ${n.closing_note}` : ''}` : '—'])}
        />

        <Text style={[s.h1, { marginTop: 10 }]}>7. Verificação de integridade</Text>
        <Text style={s.p}>
          Cada checklist concluído e cada versão aprovada de documento guarda um código SHA-256 do seu conteúdo. Na geração deste dossiê os códigos foram recalculados:{' '}
          <Text style={s.strong}>{data.integrity.total} registro(s) conferido(s), {data.integrity.divergent} divergência(s).</Text>
        </Text>
        {data.integrity.rows.length > 0 && (
          <Table
            cols={[{ label: 'Registro', w: 40 }, { label: 'Data', w: 20 }, { label: 'Situação', w: 40 }]}
            rows={data.integrity.rows.map((r) => [r.label, dt(r.recorded_at), { text: r.stored_hash ? 'conteúdo diferente do registrado' : 'sem código registrado', bad: true }])}
          />
        )}
        <Footer left={footer} />
      </Page>

      {data.documents.map((d, i) => (
        <Page key={d.id} size="A4" style={s.page}>
          <Text style={s.h1}>Anexo {String.fromCharCode(65 + i)} — {d.title}</Text>
          <Text style={s.muted}>Versão {d.version} · aprovada em {pdfDate(d.approved_at)}{d.approved_by_name ? ` por ${d.approved_by_name}` : ''}</Text>
          <Text style={[s.hash, { marginBottom: 10 }]}>SHA-256: {d.content_hash}</Text>
          <PdfMarkdown md={d.body_md ?? ''} />
          <Footer left={footer} />
        </Page>
      ))}
    </Document>
  );
}

function statusCell(validUntil: string | null, today: string) {
  const st = licenseStatus(validUntil, today);
  return { text: st === 'expired' ? 'vencida' : st === 'expiring' ? 'vence em breve' : st === 'valid' ? 'válida' : 'sem validade', bad: st === 'expired' };
}
