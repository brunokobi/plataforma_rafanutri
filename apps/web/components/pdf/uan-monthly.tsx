import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { monthLabel, variation, type MonthlyReport } from '@/lib/uan/network';

Font.registerHyphenationCallback((word) => [word]);
const GREEN = '#2f7a3d';
const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#17241b', lineHeight: 1.4 },
  kind: { fontSize: 9, letterSpacing: 1.5, color: GREEN, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  muted: { color: '#5b6a60' },
  h1: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: GREEN, marginTop: 16, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', borderWidth: 0.8, borderColor: '#dde3dc', borderRadius: 6, padding: 8 },
  label: { fontSize: 8, color: '#5b6a60' },
  value: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  delta: { fontSize: 8, color: '#5b6a60' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#dde3dc', paddingVertical: 3 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, fontSize: 7.5, color: '#5b6a60' },
});
const brl = (c: number | null) => (c === null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const delta = (v: number | null, prev: string) => (v === null ? '' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR')}% sobre ${prev}`);

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <View style={s.tile}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text>{note ? <Text style={s.delta}>{note}</Text> : null}</View>;
}

/** RN-229 — Relatório mensal da unidade para o cliente. */
export function MonthlyPdf({ data }: { data: MonthlyReport }) {
  const st = data.stats;
  const prev = monthLabel(data.previous.month);
  return (
    <Document title={`Relatório mensal — ${data.unit.name} — ${data.month}`} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.page}>
        <Text style={s.kind}>RELATÓRIO MENSAL</Text>
        <Text style={s.title}>{data.unit.name}</Text>
        <Text style={s.muted}>{data.organization ?? ''} · {monthLabel(data.month)} ({data.from.split('-').reverse().join('/')} a {data.to.split('-').reverse().join('/')}){data.technical_lead ? ` · RT: ${data.technical_lead}` : ''}</Text>

        <Text style={s.h1}>Custos e refeições</Text>
        <View style={s.grid}>
          <Tile label="Custo realizado" value={brl(st.cost_cents)} note={st.cost_estimated_missing ? 'parte do consumo sem preço' : undefined} />
          <Tile label="Refeições servidas" value={st.meals_served.toLocaleString('pt-BR')} note={`previstas: ${st.meals_planned.toLocaleString('pt-BR')}`} />
          <Tile label="Custo por refeição" value={brl(st.cost_per_meal_cents)} note={[st.cost_target_cents !== null ? `teto ${brl(st.cost_target_cents)}` : null, delta(variation(st.cost_per_meal_cents, data.previous.cost_per_meal_cents), prev)].filter(Boolean).join(' · ')} />
        </View>

        <Text style={s.h1}>Desperdício</Text>
        <View style={s.grid}>
          <Tile label="Sobra limpa" value={pct(st.waste.leftover_pct)} note={`${(st.waste.leftover_g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`} />
          <Tile label="Resto-ingesta" value={pct(st.waste.plate_pct)} note={st.waste.plate_g_per_meal !== null ? `${st.waste.plate_g_per_meal} g por refeição` : undefined} />
          <Tile label="Produzido" value={`${(st.waste.produced_g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`} />
        </View>

        <Text style={s.h1}>Qualidade e satisfação</Text>
        <View style={s.grid}>
          <Tile label="Índice de conformidade" value={st.compliance_index === null ? '—' : st.compliance_index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} note={data.previous.compliance_index !== null ? `${prev}: ${data.previous.compliance_index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : undefined} />
          <Tile label="Não conformidades no mês" value={`${data.non_conformities.opened}`} note={`${data.non_conformities.closed} fechada(s) · ${st.nc_open} em aberto hoje`} />
          <Tile label="Satisfação" value={st.satisfaction.avg === null ? '—' : `${st.satisfaction.avg.toLocaleString('pt-BR')} de 5`} note={`${st.satisfaction.responses} resposta(s) · ${data.trainings} treinamento(s)`} />
        </View>

        {st.top_items.length > 0 && (
          <>
            <Text style={s.h1}>Insumos que mais pesaram no custo</Text>
            {st.top_items.map((t, i) => <View key={i} style={s.tr}><Text style={{ width: '75%' }}>{i + 1}. {t.name}</Text><Text style={{ width: '25%', textAlign: 'right' }}>{brl(t.cost_cents)}</Text></View>)}
          </>
        )}
        {data.comments.length > 0 && (
          <>
            <Text style={s.h1}>O que os comensais disseram</Text>
            {data.comments.map((c, i) => <Text key={i} style={{ marginBottom: 3 }}>“{c.comment}”{c.dish ? ` — ${c.dish}` : ''}{c.rating ? ` (${c.rating}/5)` : ''}</Text>)}
          </>
        )}
        <Text style={s.footer} fixed>Gerado pela Rafanutri. Custo realizado = retiradas do estoque para produção pelo custo do lote (ou preço vigente). Sobra = sobra ÷ produzido; resto-ingesta = resto ÷ (produzido − sobra).</Text>
      </Page>
    </Document>
  );
}
