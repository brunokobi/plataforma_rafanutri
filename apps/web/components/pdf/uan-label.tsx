import { Circle, Document, Line, Page, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { FRONT_LABEL, LABEL_ROWS } from '@rafanutri/nutrition-core';
import { linearText, type LabelRecord } from '@/lib/uan/labels';

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#000' },
  lupa: { backgroundColor: '#000', width: 150, padding: 6, marginBottom: 10 },
  lupaHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  lupaTitle: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 12 },
  lupaItem: { backgroundColor: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center', paddingVertical: 2, marginTop: 2 },
  box: { borderWidth: 1.5, borderColor: '#000', width: 300, padding: 4 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 12, textAlign: 'center', paddingBottom: 3, borderBottomWidth: 1 },
  row: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5 },
  thick: { borderBottomWidth: 3 },
  c0: { width: '46%' },
  c: { width: '18%', textAlign: 'right' },
  vd: { width: '18%', textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  small: { fontSize: 7.5, paddingTop: 3 },
  allergen: { fontFamily: 'Helvetica-Bold', marginTop: 8, width: 300 },
  meta: { marginTop: 24, fontSize: 7.5, color: '#555' },
});
const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit === 'kcal' ? ' kcal' : ` ${unit}`}`);

/** RN-164 — Rótulo em PDF (formato vertical da IN 75/2020; dimensões a validar). */
export function LabelPdf({ label }: { label: LabelRecord }) {
  const unit = label.physical_state === 'liquid' ? 'mL' : 'g';
  const portion = `${label.portion_g.toLocaleString('pt-BR')} ${unit}`;
  return (
    <Document title={`Rótulo — ${label.product_name}`} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.page}>
        <Text style={[s.bold, { fontSize: 13, marginBottom: 10 }]}>{label.product_name}</Text>
        {label.front_warnings.length > 0 && (
          <View style={s.lupa}>
            <View style={s.lupaHead}>
              <Svg width={18} height={18} viewBox="0 0 18 18"><Circle cx={7} cy={7} r={5} stroke="#fff" strokeWidth={2} fill="none" /><Line x1={11} y1={11} x2={16} y2={16} stroke="#fff" strokeWidth={2.5} /></Svg>
              <Text style={s.lupaTitle}>ALTO EM</Text>
            </View>
            {label.front_warnings.map((w) => <Text key={w} style={s.lupaItem}>{FRONT_LABEL[w]}</Text>)}
          </View>
        )}
        {label.layout === 'linear' ? (
          <View style={[s.box, { width: 480 }]}><Text style={{ lineHeight: 1.4 }}>{linearText(label)}</Text></View>
        ) : (
        <View style={s.box}>
          <Text style={s.title}>INFORMAÇÃO NUTRICIONAL</Text>
          {label.servings_per_pack ? <Text style={{ paddingTop: 2 }}>Porções por embalagem: {label.servings_per_pack.toLocaleString('pt-BR')}</Text> : null}
          <View style={[s.row, s.thick]}><Text>Porção: {portion} ({label.household_measure})</Text></View>
          <View style={[s.row, { borderBottomWidth: 1.5 }]}>
            <Text style={s.c0} />
            <Text style={[s.c, s.bold]}>100 {unit}</Text>
            <Text style={[s.c, s.bold]}>{portion}</Text>
            <Text style={[s.vd, s.bold]}>%VD*</Text>
          </View>
          {LABEL_ROWS.map((r, i) => (
            <View key={r.key} style={[s.row, i === LABEL_ROWS.length - 1 ? s.thick : {}]}>
              <Text style={[s.c0, r.indent ? { paddingLeft: 10 } : s.bold]}>{r.label}</Text>
              <Text style={s.c}>{fmt(label.values.per100[r.key], r.unit)}</Text>
              <Text style={s.c}>{fmt(label.values.perPortion[r.key], r.unit)}</Text>
              <Text style={s.vd}>{label.values.vd[r.key] ?? ''}</Text>
            </View>
          ))}
          <Text style={s.small}>*Percentual de valores diários fornecidos pela porção.</Text>
        </View>
        )}
        {label.allergen_statement && <Text style={s.allergen}>{label.allergen_statement}</Text>}
        <Text style={s.meta}>Gerado pela plataforma Rafanutri a partir da ficha técnica versão {label.sheet_version}, em {new Date(label.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Cálculo pela IN 75/2020; a responsabilidade pelo rótulo é do responsável técnico.</Text>
      </Page>
    </Document>
  );
}
