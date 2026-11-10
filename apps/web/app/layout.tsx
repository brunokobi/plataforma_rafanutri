import type { Metadata, Viewport } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['SOFT', 'opsz'] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rafanutri.brunokobi.tech';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Rafanutri — seu consultório de nutrição em um só lugar', template: '%s · Rafanutri' },
  description:
    'Anamnese, avaliação, cálculo energético e plano alimentar em minutos, com área do paciente. Comece grátis com até 20 pacientes.',
  applicationName: 'Rafanutri',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Rafanutri',
    title: 'Rafanutri — seu consultório de nutrição em um só lugar',
    description: 'Planos alimentares em minutos, área do paciente e grátis até 20 pacientes.',
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#101612' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
