// U6b — Licenças, integridade, dossiê para a fiscalização e Manual de Boas Práticas (RN-157, RN-166, RN-167).
import { renderTemplate } from '@/lib/uan/documents';

export type LicenseKind = 'sanitary_permit' | 'rt_certificate' | 'pest_control' | 'water_tank_cleaning' | 'fire_permit' | 'other';
export const LICENSE_LABEL: Record<LicenseKind, string> = {
  sanitary_permit: 'Alvará sanitário',
  rt_certificate: 'Certidão de responsabilidade técnica',
  pest_control: 'Controle de pragas (certificado)',
  water_tank_cleaning: 'Limpeza do reservatório de água',
  fire_permit: 'Auto de vistoria do Corpo de Bombeiros',
  other: 'Outro',
};
export const LICENSE_KINDS = Object.keys(LICENSE_LABEL) as LicenseKind[];

export interface License { id: string; kind: LicenseKind; title: string | null; number: string | null; issued_on: string | null; valid_until: string | null; provider: string | null; notes: string | null; archived: boolean; created_at: string }
export interface UnitLicenses { unit: { id: string; name: string }; can_edit: boolean; today: string; licenses: License[] }

export type LicenseStatus = 'valid' | 'expiring' | 'expired' | 'no_date';
/** Vencida, vencendo (até 30 dias), válida ou sem validade. */
export function licenseStatus(validUntil: string | null, today: string, warnDays = 30): LicenseStatus {
  if (!validUntil) return 'no_date';
  if (validUntil < today) return 'expired';
  const days = Math.round((Date.parse(`${validUntil}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400e3);
  return days <= warnDays ? 'expiring' : 'valid';
}
export const licenseName = (l: Pick<License, 'kind' | 'title'>) => (l.kind === 'other' ? l.title ?? 'Outro' : l.title ? `${LICENSE_LABEL[l.kind]} — ${l.title}` : LICENSE_LABEL[l.kind]);

export interface IntegrityRow { kind: 'checklist' | 'document'; record_id: string; label: string; recorded_at: string; stored_hash: string | null; computed_hash: string; ok: boolean }
export interface IntegrityReport { unit: { id: string; name: string }; from: string; to: string; total: number; divergent: number; rows: IntegrityRow[] }

export interface CurrentDoc { id: string; kind: string; code: string | null; title: string; version_id: string; version: number; approved_at: string; next_review_on: string | null; content_hash: string; approved_by_name: string | null; body_md?: string }
export interface UnitInfo { id: string; name: string; kind?: string; cnpj: string | null; address: string | null; city: string | null; state: string | null; sanitary_license: string | null; sanitary_license_expires_at: string | null }

export interface DossierData {
  period: { from: string; to: string };
  generated_at: string;
  organization: string | null;
  unit: UnitInfo;
  technical_lead: string | null;
  licenses: License[];
  documents: CurrentDoc[];
  manual: { edition: number; created_at: string; signed_name: string | null; file_hash: string | null } | null;
  trainings: Array<{ id: string; topic: string; held_on: string; hours: number; instructor: string | null; attendees: string[] }>;
  checklists: Array<{ id: string; template_name: string; completed_at: string; score: number | null; conform: number; non_conform: number; na: number; completed_by: string | null; content_hash: string | null; failures: Array<{ prompt: string; critical: boolean; comment: string | null; value: number | null; unit: string | null }> }>;
  temperatures: Array<{ recorded_at: string; target: string; value: number; min: number | null; max: number | null; out_of_range: boolean; corrective_action: string | null; by: string | null }>;
  non_conformities: Array<{ id: string; source: string; title: string; severity: string; status: string; opened_at: string; due_at: string; closed_at: string | null; closing_note: string | null; plans: number }>;
  integrity: { total: number; divergent: number; rows: IntegrityRow[] };
  truncated: boolean;
}

export interface ManualData {
  organization: string | null;
  unit: UnitInfo;
  technical_lead: string | null;
  team_size: number;
  last_training_on: string | null;
  equipment: Array<{ name: string; kind: string; min_temp: number | null; max_temp: number | null }>;
  licenses: License[];
  documents: CurrentDoc[];
  editions: Array<{ id: string; edition: number; created_at: string; signed_name: string | null; file_hash: string | null; created_by_name: string | null; documents: number }>;
  can_issue: boolean;
  can_audit: boolean;
}

export interface ExportRow { id: string; kind: 'manual' | 'dossier'; edition: number | null; period_from: string | null; period_to: string | null; integrity: { total: number; divergent: number } | null; file_hash: string | null; signed_name: string | null; created_at: string; created_by_name: string | null }

const EQUIPMENT_KIND: Record<string, string> = {
  refrigerator: 'geladeira', freezer: 'freezer', cold_room: 'câmara fria', freezer_room: 'câmara de congelados',
  hot_holding: 'balcão/estufa quente', cold_holding: 'balcão refrigerado', other: 'equipamento',
};
const temps = (e: { min_temp: number | null; max_temp: number | null }) =>
  e.min_temp !== null && e.max_temp !== null ? `${e.min_temp} a ${e.max_temp} °C` : e.max_temp !== null ? `até ${e.max_temp} °C` : e.min_temp !== null ? `a partir de ${e.min_temp} °C` : '';

const POP_CODES: Record<string, string> = { 'pop-higienizacao': 'POP 1', 'pop-agua': 'POP 2', 'pop-pragas': 'POP 3', 'pop-manipuladores': 'POP 4' };
/** Referência a um POP aprovado ("ver POP 1 — anexo A, versão 2") ou aviso de que falta. */
export function popRef(docs: CurrentDoc[], code: string, annex: Map<string, string>): string {
  const d = docs.find((x) => x.code === code);
  if (!d) return `**Pendente:** o ${POP_CODES[code] ?? 'POP'} ainda não foi aprovado na plataforma.`;
  return `O procedimento detalhado está no **${d.title}** (versão ${d.version}), no **anexo ${annex.get(d.id) ?? '—'}**.`;
}

/** Letras dos anexos (A, B, C…) na ordem dos documentos vigentes. */
export function annexLetters(docs: CurrentDoc[]): Map<string, string> {
  return new Map(docs.map((d, i) => [d.id, i < 26 ? String.fromCharCode(65 + i) : `A${i - 25}`]));
}

export interface ManualSection { title: string; body: string }

/** Seções do Manual pelos itens da RDC 216/2004, preenchidas com os dados da unidade. Texto-base a revisar com a RT. */
export function manualSections(m: ManualData, today: string): ManualSection[] {
  const annex = annexLetters(m.documents);
  const u = m.unit;
  const addr = [u.address, u.city, u.state].filter(Boolean).join(', ') || '(endereço não informado)';
  const vars = { unidade: u.name, empresa: m.organization ?? u.name, endereco: addr, rt: m.technical_lead ?? '(RT não definido)', data: today.split('-').reverse().join('/') };
  const equipment = m.equipment.length
    ? m.equipment.map((e) => `- ${e.name} (${EQUIPMENT_KIND[e.kind] ?? e.kind}${temps(e) ? `, ${temps(e)}` : ''})`).join('\n')
    : '- (cadastre os equipamentos da unidade na plataforma)';
  const licenses = m.licenses.length
    ? m.licenses.map((l) => `- ${licenseName(l)}${l.number ? ` nº ${l.number}` : ''}${l.valid_until ? `, válido até ${l.valid_until.split('-').reverse().join('/')}` : ''}`).join('\n')
    : '- (registre o alvará sanitário e os certificados na plataforma)';
  const t = (s: string) => renderTemplate(s, vars);
  return [
    { title: '1. Identificação e responsabilidade técnica', body: t(`**Empresa:** {{empresa}}
**Unidade:** {{unidade}}${u.cnpj ? `\n**CNPJ:** ${u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}` : ''}
**Endereço:** {{endereco}}
**Responsável técnico (RT):** {{rt}}
**Equipe cadastrada:** ${m.team_size} pessoa(s)

Este Manual descreve as Boas Práticas adotadas na unidade, conforme a RDC Anvisa nº 216/2004, e deve ficar acessível aos manipuladores e à autoridade sanitária.

## Licenças e certificados
${licenses}`) },
    { title: '2. Edificação, instalações, equipamentos, móveis e utensílios', body: t(`A edificação e as instalações têm fluxo ordenado e sem cruzamentos entre as etapas de preparo, com pisos, paredes e tetos de revestimento liso, impermeável e lavável, em bom estado de conservação. As aberturas externas têm telas milimetradas removíveis. A iluminação tem proteção contra quebra e as instalações elétricas são embutidas ou protegidas.

As instalações sanitárias e os vestiários não se comunicam diretamente com a área de preparo. Há lavatórios exclusivos para as mãos na área de manipulação, com sabonete antisséptico, papel toalha não reciclado e coletor com tampa acionada sem contato manual.

## Equipamentos de conservação
${equipment}

Os equipamentos que entram em contato com alimentos são de material que não transmite substâncias tóxicas, odores nem sabores, e são mantidos em bom estado. As temperaturas dos equipamentos de frio e calor são registradas na plataforma, com ação corretiva quando fora do limite.`) },
    { title: '3. Higienização de instalações, equipamentos, móveis e utensílios', body: `As operações de higienização são feitas por pessoas treinadas, com frequência que garanta a manutenção das condições higiênico-sanitárias, e registradas nos checklists da plataforma. Os produtos saneantes são regularizados na Anvisa, identificados e guardados em local reservado.

${popRef(m.documents, 'pop-higienizacao', annex)}` },
    { title: '4. Controle integrado de vetores e pragas urbanas', body: `A unidade adota medidas preventivas e corretivas para impedir a atração, o abrigo, o acesso e a proliferação de vetores e pragas. Quando há controle químico, ele é feito por empresa especializada, com comprovante de execução e as precauções necessárias para não contaminar alimentos, equipamentos e utensílios.

${popRef(m.documents, 'pop-pragas', annex)}` },
    { title: '5. Abastecimento de água', body: `Usa-se somente água potável para a manipulação de alimentos. O reservatório é íntegro, tampado e higienizado a cada seis meses, no mínimo, com registro da operação; o gelo para consumo é feito com água potável.

${popRef(m.documents, 'pop-agua', annex)}` },
    { title: '6. Manejo dos resíduos', body: `Os recipientes de resíduos da área de preparo são de fácil higienização, com tampa acionada sem contato manual, e são esvaziados com a frequência necessária para evitar acúmulo. Os resíduos são retirados da área de preparo em recipientes fechados e guardados em área separada até a coleta.` },
    { title: '7. Manipuladores', body: `Os manipuladores têm controle de saúde registrado e são afastados quando apresentam lesões ou sintomas que possam comprometer o alimento. Usam uniforme limpo, compatível com a atividade e trocado diariamente, cabelos presos e protegidos, unhas curtas e sem esmalte, e não usam adornos. Lavam as mãos ao chegar, depois de usar o sanitário, de tocar em lixo ou em alimentos crus e sempre que necessário.

Os manipuladores são capacitados periodicamente em higiene pessoal, manipulação higiênica e doenças transmitidas por alimentos; os treinamentos ficam registrados na plataforma${m.last_training_on ? ` (último em ${m.last_training_on.split('-').reverse().join('/')})` : ''}.

${popRef(m.documents, 'pop-manipuladores', annex)}` },
    { title: '8. Matérias-primas, ingredientes e embalagens', body: `Os fornecedores são cadastrados e as matérias-primas são conferidas no recebimento (temperatura, validade, integridade da embalagem, características sensoriais e rotulagem). Os produtos reprovados são devolvidos ou identificados e separados, e o recebimento fica registrado na plataforma.

Os insumos são armazenados sobre paletes, estrados ou prateleiras, afastados do piso e das paredes, identificados e usados pela ordem de validade (primeiro que vence, primeiro que sai).` },
    { title: '9. Preparação do alimento', body: `As etapas de preparo seguem as fichas técnicas da unidade. Os alimentos perecíveis ficam em temperatura ambiente só pelo tempo mínimo necessário à preparação.

- O descongelamento é feito sob refrigeração a temperatura inferior a 5 °C ou em forno de micro-ondas, quando o alimento for submetido imediatamente à cocção.
- O tratamento térmico garante que todas as partes do alimento atinjam no mínimo 70 °C (ou combinações de tempo e temperatura que assegurem a qualidade higiênico-sanitária).
- O resfriamento do alimento preparado leva a temperatura de 60 °C a 10 °C em até duas horas.
- Os óleos e gorduras de fritura não passam de 180 °C e são trocados ao apresentar alteração.
- Os vegetais consumidos crus são higienizados com produto regularizado, conforme o rótulo.

As temperaturas de cocção, reaquecimento e resfriamento são registradas na plataforma.` },
    { title: '10. Armazenamento e transporte do alimento preparado', body: `O alimento preparado é identificado e protegido contra contaminantes. Conservado sob refrigeração a temperatura inferior a 5 °C, ou congelado a -18 °C ou menos, respeitando o prazo de validade definido pela unidade. Mantido aquecido a temperatura superior a 60 °C por no máximo seis horas. No transporte, os alimentos são mantidos nas mesmas condições de temperatura e protegidos.` },
    { title: '11. Exposição ao consumo do alimento preparado', body: `Os equipamentos de exposição (balcões térmicos e refrigerados) têm temperatura monitorada e registrada, e barreiras de proteção que impedem a contaminação pelo consumidor. Os utensílios de servir são mantidos limpos e trocados com frequência. A área de recebimento de dinheiro é separada da área de alimentos.` },
    { title: '12. Documentação e registro', body: `A unidade mantém, na plataforma Rafanutri, este Manual e os Procedimentos Operacionais Padronizados aprovados e assinados pelo responsável, além dos registros de checklists, temperaturas, não conformidades e ações corretivas, treinamentos e recebimentos. Os registros são guardados por no mínimo 30 dias após a data de preparação dos alimentos e não podem ser apagados; cada checklist concluído e cada versão de documento guarda um código de integridade (SHA-256) que permite verificar se o conteúdo foi alterado.

## Documentos anexos
${m.documents.length ? m.documents.map((d) => `- Anexo ${annex.get(d.id)}: ${d.title} — versão ${d.version}`).join('\n') : '- (nenhum documento aprovado ainda)'}` },
    { title: '13. Responsabilidade', body: t(`O responsável pelas atividades de manipulação de alimentos é {{rt}}, capacitado nos temas da RDC 216/2004 (contaminantes alimentares, doenças transmitidas por alimentos, manipulação higiênica e Boas Práticas).

> Este Manual foi gerado a partir de um modelo e dos dados cadastrados na plataforma. Ele deve ser revisado e assinado pelo responsável técnico antes de ser apresentado à autoridade sanitária.`) },
  ];
}

/** Resumo do conteúdo do Manual para registrar na emissão. */
export const manualIncludes = (m: ManualData) => ({ documents: m.documents.map((d) => ({ id: d.id, version_id: d.version_id, version: d.version, hash: d.content_hash })) });

/** Período padrão do dossiê: os últimos 30 dias até hoje. */
export function defaultPeriod(today: string): { from: string; to: string } {
  return { from: new Date(Date.parse(`${today}T12:00:00Z`) - 29 * 86400e3).toISOString().slice(0, 10), to: today };
}
