import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * CSP (RN-049). Só em produção: em desenvolvimento o Next usa eval para o recarregamento rápido.
 * - 'unsafe-inline' em scripts: o App Router injeta scripts inline de inicialização (sem nonce por enquanto);
 * - 'wasm-unsafe-eval' e connect-src data:: o gerador de PDF (@react-pdf) carrega o WebAssembly do layout de um data: URI;
 * - Cloudflare Web Analytics: script e envio de métricas injetados pelo Cloudflare.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Telas com anúncio do plano Gratuito (lib/ads/config.ts): a CSP libera o Google AdSense só nelas. As telas
 * com dados de paciente continuam com a CSP fechada acima.
 */
const GOOGLE_ADS = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com';
const cspAds = csp
  .replace("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com", `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com ${GOOGLE_ADS}`)
  .replace("img-src 'self' data: blob:", 'img-src \'self\' data: blob: https:')
  .replace("connect-src 'self' data: https://cloudflareinsights.com", `connect-src 'self' data: https://cloudflareinsights.com ${GOOGLE_ADS}`)
  .replace("frame-ancestors 'none'", `frame-src ${GOOGLE_ADS}; frame-ancestors 'none'`);
/** Iguais a AD_ZONE_EXACT e AD_ZONE_PREFIX em lib/ads/config.ts. */
const AD_ZONE_SOURCES = ['/app', '/app/configuracoes/plano', '/app/alimentos/:path*', '/app/receitas/:path*', '/app/questionarios/:path*', '/app/modelos-de-plano/:path*', '/app/orientacoes/:path*'];

const securityHeaders = [
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: csp }] : []),
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  transpilePackages: ['@rafanutri/nutrition-core', '@rafanutri/forms'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      // a última regra que casa ganha: CSP com o AdSense só nas telas com anúncio
      ...(process.env.NODE_ENV === 'production' ? AD_ZONE_SOURCES.map((source) => ({ source, headers: [{ key: 'Content-Security-Policy', value: cspAds }] })) : []),
    ];
  },
};

export default config;
