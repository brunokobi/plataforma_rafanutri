import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

const GREEN = '#2f7a3d';
const s = StyleSheet.create({
  page: { padding: 56, fontFamily: 'Helvetica', color: '#17241b', justifyContent: 'center' },
  frame: { borderWidth: 3, borderColor: GREEN, padding: 40, alignItems: 'center' },
  kind: { fontSize: 11, letterSpacing: 3, color: GREEN, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 30, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 26 },
  text: { fontSize: 14, textAlign: 'center', lineHeight: 1.7 },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginVertical: 10, textAlign: 'center' },
  signRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 56 },
  sign: { width: 260, alignItems: 'center' },
  line: { width: 240, borderTopWidth: 1, borderTopColor: '#17241b', marginBottom: 4 },
  small: { fontSize: 10, color: '#5b6a60' },
});
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** RN-159 — Certificado de participação no treinamento (uma página por participante). */
export function TrainingCertificatePdf({ unit, organization, training }: { unit: string; organization: string | null; training: { topic: string; held_on: string; hours: number; instructor: string | null; attendees: string[] } }) {
  return (
    <Document title={`Certificados — ${training.topic}`} creator="Rafanutri" language="pt-BR">
      {training.attendees.map((name, i) => (
        <Page key={i} size="A4" orientation="landscape" style={s.page}>
          <View style={s.frame}>
            <Text style={s.kind}>{(organization ?? unit).toUpperCase()}</Text>
            <Text style={s.title}>Certificado</Text>
            <Text style={s.text}>Certificamos que</Text>
            <Text style={s.name}>{name}</Text>
            <Text style={s.text}>
              participou do treinamento <Text style={{ fontFamily: 'Helvetica-Bold' }}>{training.topic}</Text>, realizado em {day(training.held_on)} na unidade {unit}, com carga horária de {training.hours.toLocaleString('pt-BR')} hora(s).
            </Text>
            <View style={s.signRow}>
              <View style={s.sign}>
                <View style={s.line} />
                <Text>{training.instructor ?? 'Instrutor'}</Text>
                <Text style={s.small}>Instrutor</Text>
              </View>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
