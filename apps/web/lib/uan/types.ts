// Módulo UAN (RN-121 a RN-123): tipos, rótulos e regras puras das unidades produtoras.

export type UnitKind = 'industrial' | 'hospital' | 'school' | 'hotel' | 'restaurant' | 'catering' | 'other';
export type UnitRole = 'technical_lead' | 'manager' | 'cook' | 'stock_keeper' | 'auditor';

export const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  industrial: 'Cozinha industrial',
  hospital: 'Hospital',
  school: 'Escola',
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  catering: 'Catering / eventos',
  other: 'Outro',
};

export const UNIT_ROLE_LABEL: Record<UnitRole, string> = {
  technical_lead: 'Nutricionista RT',
  manager: 'Gestor',
  cook: 'Cozinheiro(a)',
  stock_keeper: 'Estoquista',
  auditor: 'Auditor',
};

export interface ProductionUnit {
  id: string;
  organization_id: string;
  name: string;
  kind: UnitKind;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number;
  sanitary_license: string | null;
  /** AAAA-MM-DD */
  sanitary_license_expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface UanOrganization {
  id: string;
  name: string;
  is_owner: boolean;
  /** Unidades ativas permitidas pelo contrato (só para o owner). */
  unit_limit: number | null;
  units: Array<ProductionUnit & { roles: UnitRole[] }>;
}

export interface UnitMember {
  user_id: string;
  role: UnitRole;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  /** A própria pessoa logada. */
  is_self?: boolean;
}

/** Convite pendente da equipe (RN-220). */
export interface UnitInvite {
  id: string;
  role: UnitRole;
  label: string | null;
  expires_at: string;
  date_created: string;
}

export interface UnitDetail {
  unit: ProductionUnit;
  is_owner: boolean;
  roles: UnitRole[];
  can_edit: boolean;
  /** Owner, gestor ou RT: vê a equipe e os convites. */
  can_manage_team?: boolean;
  /** Papéis que esta pessoa pode convidar, trocar ou remover. */
  invitable_roles?: UnitRole[];
  members: UnitMember[];
  invites?: UnitInvite[];
}

/** O que cada papel faz, mostrado no convite. */
export const UNIT_ROLE_HINT: Record<UnitRole, string> = {
  technical_lead: 'Responde tecnicamente pela unidade: aprova cardápios, fichas e planos de ação.',
  manager: 'Administra a unidade e a equipe operacional.',
  cook: 'Preenche checklists, temperaturas e registros da produção.',
  stock_keeper: 'Registra recebimento, estoque e validade dos insumos.',
  auditor: 'Consulta registros e relatórios, sem alterar.',
};

/** Pré-visualização pública do convite. */
export interface UnitInvitePreview {
  organization: string;
  unit: string;
  kind: UnitKind;
  role: UnitRole;
  label: string | null;
  expires_at: string;
}

/** Dados do cadastro pelo convite (validados também no servidor). */
export function validateStaffSignup(input: { full_name: string; email: string; password: string; confirm: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.full_name.trim();
  if (name.length < 2 || name.length > 120) errors.full_name = 'Informe seu nome.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) || input.email.length > 254) errors.email = 'Informe um e-mail válido.';
  if (input.password.length < 8 || input.password.length > 128) errors.password = 'A senha precisa ter de 8 a 128 caracteres.';
  else if (input.password !== input.confirm) errors.confirm = 'As senhas não conferem.';
  return errors;
}

export interface UnitInput {
  name: string;
  kind: UnitKind;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  geo_lat?: string;
  geo_lng?: string;
  geo_radius_m?: string;
  sanitary_license?: string;
  sanitary_license_expires_at?: string;
  active?: boolean;
}

export type LicenseStatus = 'missing' | 'expired' | 'expiring' | 'ok';

/** Alvará sanitário: vencido, vencendo em até 30 dias ou em dia (RN-123). */
export function licenseStatus(expires: string | null, today: string): { status: LicenseStatus; days: number | null } {
  if (!expires) return { status: 'missing', days: null };
  const days = Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { status: 'expired', days };
  if (days <= 30) return { status: 'expiring', days };
  return { status: 'ok', days };
}

export function formatCnpj(cnpj: string | null): string {
  if (!cnpj || !/^\d{14}$/.test(cnpj)) return cnpj ?? '';
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Validação no navegador (o servidor confere de novo). Devolve o primeiro erro por campo. */
export function validateUnit(input: UnitInput): Partial<Record<keyof UnitInput, string>> {
  const e: Partial<Record<keyof UnitInput, string>> = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) e.name = 'Informe o nome da unidade (2 a 120 caracteres).';
  const cnpj = (input.cnpj ?? '').replace(/\D/g, '');
  if (cnpj && cnpj.length !== 14) e.cnpj = 'CNPJ com 14 dígitos.';
  const state = (input.state ?? '').trim();
  if (state && !/^[A-Za-z]{2}$/.test(state)) e.state = 'UF com 2 letras.';
  const lat = (input.geo_lat ?? '').trim();
  const lng = (input.geo_lng ?? '').trim();
  if (Boolean(lat) !== Boolean(lng)) e.geo_lat = 'Informe latitude e longitude juntas.';
  else if (lat && (!Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90)) e.geo_lat = 'Latitude inválida.';
  else if (lng && (!Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180)) e.geo_lng = 'Longitude inválida.';
  const radius = (input.geo_radius_m ?? '').trim();
  if (radius && (!Number.isInteger(Number(radius)) || Number(radius) < 20 || Number(radius) > 5000)) e.geo_radius_m = 'Raio entre 20 e 5.000 m.';
  return e;
}
