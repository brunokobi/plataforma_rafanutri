import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ClinicalDocumentPdfData } from '@/lib/documents/pdf-data';

const s = StyleSheet.create({
  page: { paddingBottom: 56, fontFamily: 'Helvetica', fontSize: 11, color: '#17241b', lineHeight: 1.45 },
  bar: { height: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 40, paddingTop: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#dde3dc' },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  practice: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6a60', fontSize: 9.5 },
  body: { paddingHorizontal: 40, paddingTop: 22 },
  kind: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 14 },
  patientBox: { backgroundColor: '#f4f6f2', borderRadius: 6, padding: 10, marginBottom: 18 },
  label: { fontSize: 8, color: '#5b6a60', textTransform: 'uppercase', letterSpacing: 0.6 },
  strong: { fontFamily: 'Helvetica-Bold' },
  paragraph: { marginBottom: 8 },
  exam: { flexDirection: 'row', marginBottom: 4 },
  box: { width: 9, height: 9, borderWidth: 1, borderColor: '#17241b', marginRight: 8, marginTop: 3 },
  date: { marginTop: 22, textAlign: 'right' },
  signature: { marginTop: 56, alignItems: 'center' },
  line: { width: 240, borderTopWidth: 1, borderTopColor: '#17241b', marginBottom: 4 },
  draft: { position: 'absolute', top: 340, left: 0, right: 0, textAlign: 'center', fontSize: 64, color: '#e5e9e3', transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#5b6a60' },
});

export interface PdfLogo {
  data: Buffer;
  format: 'png' | 'jpg';
}

/** RN-215 — Documento clínico com a marca do consultório e espaço para assinatura. */
export function ClinicalDocumentPdf({ data, logo }: { data: ClinicalDocumentPdfData; logo: PdfLogo | null }) {
  const c = data.practice.color;
  const crn = [data.practice.crnRegion, data.practice.crn].filter(Boolean).join(' ');
  return (
    <Document title={`${data.title} — ${data.patientName}`} author={data.practice.professionalName} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={[s.bar, { backgroundColor: c }]} fixed />
        {data.draft && <Text style={s.draft} fixed>RASCUNHO</Text>}
        <View style={s.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {logo && <Image style={s.logo} src={logo} />}
          <View>
            <Text style={s.practice}>{data.practice.practiceName}</Text>
            {data.practice.professionalName ? <Text style={s.muted}>{data.practice.professionalName} · Nutricionista{crn ? ` · ${crn}` : ''}</Text> : null}
            {data.practice.contact ? <Text style={s.muted}>{data.practice.contact}</Text> : null}
          </View>
        </View>

        <View style={s.body}>
          <Text style={[s.kind, { color: c }]}>{data.kindLabel}</Text>
          <Text style={s.title}>{data.title}</Text>
          <View style={s.patientBox}>
            <Text style={s.label}>Paciente</Text>
            <Text style={s.strong}>{data.patientName}</Text>
          </View>

          {data.exams.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.strong, { marginBottom: 6 }]}>Solicito os seguintes exames:</Text>
              {data.exams.map((e) => (
                <View key={e} style={s.exam} wrap={false}>
                  <View style={s.box} />
                  <Text>{e}</Text>
                </View>
              ))}
            </View>
          )}
          {data.paragraphs.map((p, i) => (
            <Text key={i} style={s.paragraph}>{p}</Text>
          ))}

          <Text style={s.date}>{data.dateLong}</Text>
          <View style={s.signature} wrap={false}>
            <View style={s.line} />
            <Text style={s.strong}>{data.practice.professionalName || 'Nutricionista'}</Text>
            <Text style={s.muted}>Nutricionista{crn ? ` · ${crn}` : ''}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{data.practice.practiceName}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
