import { ImageResponse } from 'next/og';

export const alt = 'Rafanutri — seu consultório de nutrição em um só lugar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'radial-gradient(120% 120% at 0% 0%, #3f9a45 0%, #1f5f2b 50%, #0c2e17 100%)',
          color: 'white',
        }}
      >
        <div style={{ fontSize: 34, opacity: 0.85 }}>Rafanutri</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, marginTop: 20, maxWidth: 900 }}>
          Seu consultório de nutrição em um só lugar
        </div>
        <div style={{ fontSize: 30, marginTop: 28, color: '#F2A65A' }}>Grátis até 20 pacientes</div>
      </div>
    ),
    size,
  );
}
