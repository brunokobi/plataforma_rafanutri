import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { DECISION_LABEL, HAZARD_LABEL, haccpDecision, LEVEL_LABEL, riskOf, type PlanDetail } from '@/lib/uan/haccp';

Font.registerHyphenationCallback((word) => [word]);

const GREEN = '#2f7a3d';
const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8.5, color: '#17241b', lineHeight: 1.35 },
  kind: { fontSize: 9, letterSpacing: 1.5, color: GREEN, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  muted: { color: '#5b6a60' },
  h1: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: GREEN, marginTop: 12, marginBottom: 6 },
  flow: { alignItems: 'center', gap: 2 },
  box: { borderWidth: 0.8, borderColor: '#9aa79e', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, width: 260, textAlign: 'center' },
  ccpBox: { borderColor: '#b3261e', borderWidth: 1.4, fontFamily: 'Helvetica-Bold' },
  arrow: { color: '#9aa79e' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#dde3dc', paddingVertical: 2.5 },
  th: { fontFamily: 'Helvetica-Bold', color: '#3d4b42' },
  td: { paddingRight: 4 },
  bad: { color: '#b3261e', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 7, color: '#5b6a60', flexDirection: 'row', justifyContent: 'space-between' },
});
// A fonte padrão do PDF não tem ≥, ≤ e −.
const clean = (v: string | null | undefined) => (v ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-');

function Row({ cells, widths, header, badCol }: { cells: string[]; widths: number[]; header?: boolean; badCol?: number }) {
  return (
    <View style={s.tr} wrap={false} fixed={header}>
      {cells.map((c, i) => <Text key={i} style={[header ? s.th : s.td, { width: `${widths[i]}%` }, i === badCol ? s.bad : {}]}>{clean(c)}</Text>)}
    </View>
  );
}

export function HaccpPdf({ data }: { data: PlanDetail }) {
  const status = data.plan.status === 'approved' ? `Aprovado em ${new Date(data.plan.approved_at!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : data.plan.status === 'archived' ? 'Versão substituída' : 'RASCUNHO — sem validade';
  const approver = data.versions.find((v) => v.id === data.plan.id)?.approved_by_name;
  const ccps = data.steps.flatMap((st, i) => st.hazards.filter((h) => haccpDecision(h) === 'ccp').map((h) => ({ st, i, h })));
  const aw = [16, 9, 26, 8, 8, 6, 15, 12];
  const cw = [6, 13, 16, 15, 18, 16, 16];
  return (
    <Document title={`APPCC — ${data.plan.title}`} creator="Rafanutri" language="pt-BR">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.kind}>PLANO APPCC</Text>
        <Text style={s.title}>{clean(data.plan.title)}</Text>
        <Text style={s.muted}>{data.unit.name} · versão {data.plan.version} · {status}{approver ? ` por ${approver}` : ''}{data.sheet ? ` · ficha técnica: ${data.sheet.name}` : ''}</Text>
        {data.plan.scope && <Text style={{ marginTop: 4 }}>Escopo: {clean(data.plan.scope)}</Text>}

        <Text style={s.h1}>Fluxograma</Text>
        <View style={s.flow}>
          {data.steps.map((st, i) => {
            const n = st.hazards.filter((h) => haccpDecision(h) === 'ccp').map((h) => (h.ccp_number ? `PCC ${h.ccp_number}` : 'PCC'));
            return (
              <View key={i} style={{ alignItems: 'center' }} wrap={false}>
                {i > 0 && <Text style={s.arrow}>|</Text>}
                <Text style={[s.box, n.length ? s.ccpBox : {}]}>{i + 1}. {clean(st.name)}{st.target_temp !== null ? ` (${st.target_temp} °C)` : ''}{n.length ? `  [${n.join(', ')}]` : ''}</Text>
              </View>
            );
          })}
        </View>

        <Text style={s.h1} break>Análise de perigos</Text>
        <Row header widths={aw} cells={['Etapa', 'Perigo', 'Descrição e causa', 'Severidade', 'Probab.', 'Risco', 'Medida de controle', 'Decisão']} />
        {data.steps.flatMap((st, i) => st.hazards.map((h, j) => {
          const d = haccpDecision(h);
          return <Row key={`${i}-${j}`} widths={aw} badCol={d === 'ccp' ? 7 : undefined}
            cells={[`${i + 1}. ${st.name}`, HAZARD_LABEL[h.kind], `${h.description}${h.cause ? ` — ${h.cause}` : ''}`, LEVEL_LABEL[h.severity] ?? '', LEVEL_LABEL[h.probability] ?? '', String(riskOf(h)), h.control_measure ?? '—', d ? (d === 'ccp' && h.ccp_number ? `PCC ${h.ccp_number}` : DECISION_LABEL[d]) : 'pendente']} />;
        }))}

        <Text style={s.h1}>Pontos críticos de controle</Text>
        {ccps.length === 0 ? <Text>Nenhum PCC identificado.</Text> : (
          <>
            <Row header widths={cw} cells={['PCC', 'Etapa', 'Perigo', 'Limite crítico', 'Monitoramento', 'Ação corretiva', 'Verificação e registro']} />
            {ccps.map(({ st, i, h }, k) => (
              <Row key={k} widths={cw} cells={[h.ccp_number ? String(h.ccp_number) : '—', `${i + 1}. ${st.name}`, h.description, h.critical_limit ?? '—',
                [h.monitoring_what, h.monitoring_how, h.monitoring_frequency].filter(Boolean).join(' · ') || '—', h.corrective_action ?? '—', [h.verification, h.records].filter(Boolean).join(' · ') || '—']} />
            ))}
          </>
        )}
        <Text style={[s.muted, { marginTop: 10 }]}>Árvore decisória do Codex Alimentarius. Matriz de risco: severidade x probabilidade (1 a 3), significativo a partir de 4 — critérios a validar com o responsável técnico.</Text>
        <View style={s.footer} fixed>
          <Text>APPCC — {data.unit.name} — {clean(data.plan.title)} — v{data.plan.version}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
