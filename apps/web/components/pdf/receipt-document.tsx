import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReceiptPdfData } from '@/lib/finance/receipt-pdf-data';
import type { PdfLogo } from './clinical-document';

const s = StyleSheet.create({
  page: { paddingBottom: 48, fontFamily: 'Helvetica', fontSize: 11, color: '#17241b', lineHeight: 1.5 },
  bar: { height: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 40, paddingTop: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#dde3dc' },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  practice: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6a60', fontSize: 9.5 },
  body: { paddingHorizontal: 40, paddingTop: 24 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 1, lineHeight: 1.2, marginBottom: 4 },
  amountBox: { borderWidth: 1.5, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Helvetica-Bold' },
  text: { fontSize: 12, textAlign: 'justify' },
  strong: { fontFamily: 'Helvetica-Bold' },
  details: { marginTop: 16, backgroundColor: '#f4f6f2', borderRadius: 6, padding: 10, gap: 2 },
  date: { marginTop: 24, textAlign: 'right' },
  signature: { marginTop: 56, alignItems: 'center' },
  line: { width: 260, borderTopWidth: 1, borderTopColor: '#17241b', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, fontSize: 8, color: '#5b6a60', textAlign: 'center' },
});

/** RN-055 — Recibo numerado com a marca do consultório e valor por extenso. */
export function ReceiptDocument({ data, logo }: { data: ReceiptPdfData; logo: PdfLogo | null }) {
  const c = data.color;
  return (
    <Document title={`Recibo ${data.number} — ${data.practiceName}`} author={data.issuerName} creator="Rafanutri" language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={[s.bar, { backgroundColor: c }]} fixed />
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {logo && <Image style={s.logo} src={logo} />}
          <View>
            <Text style={s.practice}>{data.practiceName}</Text>
            <Text style={s.muted}>{[data.issuerName, data.issuerCrn, data.issuerTaxId].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <View style={s.body}>
          <View style={s.titleRow}>
            <View>
              <Text style={[s.title, { color: c }]}>RECIBO</Text>
              <Text style={s.muted}>{data.number}</Text>
            </View>
            <Text style={[s.amountBox, { borderColor: c }]}>{data.amount}</Text>
          </View>
          <Text style={s.text}>
            Recebi de <Text style={s.strong}>{data.payer}</Text> a importância de <Text style={s.strong}>{data.amount}</Text> ({data.amountWords}), referente a{' '}
            <Text style={s.strong}>{data.service}</Text>.
          </Text>
          <View style={s.details}>
            <Text>Pago em {data.paidOn}{data.method ? ` · ${data.method}` : ''}</Text>
          </View>
          <Text style={s.date}>{data.place}</Text>
          <View style={s.signature} wrap={false}>
            <View style={s.line} />
            <Text style={s.strong}>{data.issuerName}</Text>
            <Text style={s.muted}>{['Nutricionista', data.issuerCrn, data.issuerTaxId].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <Text style={s.footer} fixed>Recibo emitido pela plataforma Rafanutri. Este documento não substitui nota fiscal quando ela for exigida.</Text>
      </Page>
    </Document>
  );
}
