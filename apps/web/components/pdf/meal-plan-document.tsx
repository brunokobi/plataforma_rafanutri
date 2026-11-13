import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { MealPlanPdfData } from '@/lib/pdf/meal-plan-data';

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 0, fontFamily: 'Helvetica', fontSize: 10, color: '#17241b' },
  bar: { height: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 36, paddingTop: 22, paddingBottom: 14 },
  practice: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6a60' },
  badge: { fontSize: 9, color: '#ffffff', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, fontFamily: 'Helvetica-Bold' },
  body: { paddingHorizontal: 36 },
  patientBox: { backgroundColor: '#f4f6f2', borderRadius: 6, padding: 10, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 8, color: '#5b6a60', textTransform: 'uppercase', letterSpacing: 0.6 },
  meal: { marginBottom: 12, borderWidth: 1, borderColor: '#dde3dc', borderRadius: 6 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  mealTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#ffffff' },
  item: { paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#eef1ea' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { fontFamily: 'Helvetica-Bold' },
  subs: { marginTop: 2, fontSize: 9, color: '#5b6a60' },
  section: { marginTop: 6, marginBottom: 8, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  totals: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  totalBox: { flexGrow: 1, borderWidth: 1, borderColor: '#dde3dc', borderRadius: 6, padding: 6, alignItems: 'center' },
  signature: { marginTop: 28, alignItems: 'center' },
  line: { width: 200, borderTopWidth: 1, borderTopColor: '#17241b', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#5b6a60' },
});

/** PDF do plano alimentar com a marca do consultório. */
export function MealPlanDocument({ data }: { data: MealPlanPdfData }) {
  const c = data.practice.color;
  return (
    <Document title={`Plano alimentar — ${data.patient.name}`} author={data.practice.professionalName} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={[s.bar, { backgroundColor: c }]} fixed />
        <View style={s.header} fixed>
          <View>
            <Text style={s.practice}>{data.practice.practiceName}</Text>
            <Text style={s.muted}>
              {data.practice.professionalName} · Nutricionista · {data.practice.crnRegion} {data.practice.crn}
            </Text>
          </View>
          <Text style={[s.badge, { backgroundColor: c }]}>PLANO ALIMENTAR</Text>
        </View>

        <View style={s.body}>
          <View style={s.patientBox}>
            <View>
              <Text style={s.label}>Paciente</Text>
              <Text style={s.itemName}>{data.patient.name}</Text>
              <Text style={s.muted}>{data.patient.objective}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.label}>Emitido em</Text>
              <Text>{data.issuedAt}</Text>
              <Text style={[s.label, { marginTop: 4 }]}>Válido até</Text>
              <Text>{data.validUntil}</Text>
            </View>
          </View>

          {data.totals && (
            <View style={s.totals}>
              {[
                ['Energia', `${data.totals.energy} kcal`],
                ['Proteínas', `${data.totals.protein} g`],
                ['Carboidratos', `${data.totals.carbohydrate} g`],
                ['Gorduras', `${data.totals.lipid} g`],
              ].map(([k, v]) => (
                <View key={k} style={s.totalBox}>
                  <Text style={s.label}>{k}</Text>
                  <Text style={s.itemName}>{v}</Text>
                </View>
              ))}
            </View>
          )}

          {data.meals.map((m) => (
            <View key={`${m.time}-${m.name}`} style={s.meal} wrap={false}>
              <View style={[s.mealHeader, { backgroundColor: c }]}>
                <Text style={s.mealTitle}>
                  {m.time} · {m.name}
                </Text>
                {data.showKcal && <Text style={[s.mealTitle, { fontSize: 9 }]}>{m.kcal} kcal</Text>}
              </View>
              {m.items.map((i, idx) => (
                <View key={`${i.name}-${idx}`} style={[s.item, idx === 0 ? { borderTopWidth: 0 } : {}]}>
                  <View style={s.itemRow}>
                    <Text>
                      <Text style={s.itemName}>{i.name}</Text>
                      {i.measure ? <Text style={s.muted}> — {i.measure} ({i.grams} g)</Text> : null}
                    </Text>
                    {data.showKcal && <Text style={s.muted}>{i.kcal} kcal</Text>}
                  </View>
                  {i.substitutions.length > 0 && <Text style={s.subs}>Ou: {i.substitutions.join(' · ')}</Text>}
                </View>
              ))}
            </View>
          ))}

          {data.guidelines.length > 0 && (
            <View wrap={false}>
              <Text style={s.section}>Orientações</Text>
              {data.guidelines.map((g) => (
                <View key={g} style={s.bullet}>
                  <Text style={{ width: 10, color: c }}>•</Text>
                  <Text style={{ flex: 1 }}>{g}</Text>
                </View>
              ))}
            </View>
          )}

          {data.recipes.length > 0 && (
            <View>
              <Text style={s.section}>Preparações</Text>
              {data.recipes.map((r) => (
                <View key={r.name} style={{ marginBottom: 10 }} wrap={false}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{r.name}</Text>
                  {r.yieldText ? <Text style={s.muted}>{r.yieldText}</Text> : null}
                  <Text style={{ marginTop: 3 }}>Ingredientes: {r.ingredients.join('; ')}.</Text>
                  {r.instructions ? <Text style={{ marginTop: 3 }}>Modo de preparo: {r.instructions}</Text> : null}
                </View>
              ))}
            </View>
          )}

          <View style={s.signature} wrap={false}>
            <View style={s.line} />
            <Text>{data.practice.professionalName}</Text>
            <Text style={s.muted}>
              Nutricionista · {data.practice.crnRegion} {data.practice.crn}
            </Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{data.practice.contact}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          <Text>Gerado pela Rafanutri</Text>
        </View>
      </Page>
    </Document>
  );
}
