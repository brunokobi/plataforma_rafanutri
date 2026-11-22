// Tipos mínimos dos módulos da extensão do Directus usados em tests/catalog-sync.test.ts.
declare module '*/directus/extensions/rafanutri/clinical-dashboard.js' {
  export const REASONS: Record<string, string>;
}
declare module '*/directus/extensions/rafanutri/maternal.js' {
  export const ALLERGENS: string[];
  export const TEXTURES: string[];
  export const REACTIONS: string[];
  export const FEEDING_TYPES: string[];
  export const RELATIONSHIPS: string[];
  export const CONSENT_METHODS: string[];
}
declare module '*/directus/extensions/rafanutri/notifications.js' {
  export const KINDS: Record<string, { label: string; important: boolean }>;
  export const ALLOWED_HOURS: number[];
}
declare module '*/directus/extensions/rafanutri/public-health.js' {
  export const TOOLS: Record<string, string>;
}
declare module '*/directus/extensions/rafanutri/catalogs.js' {
  export * from '@rafanutri/catalogs';
}
