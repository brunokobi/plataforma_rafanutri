/** UUID completo (8-4-4-4-12). A regra antiga /^[0-9a-f-]{36}$/ aceitava 36 hífens. */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Id numérico (alimentos e preparações). */
export const isNumericId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,12}$/.test(v);
