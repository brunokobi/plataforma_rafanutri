// U6a — Documentos de BPF: modelos dos 4 POPs da RDC 216/2004, variáveis da unidade e Markdown simples.

export interface DocVars {
  unidade: string;
  endereco: string;
  cnpj: string;
  rt: string;
  data: string;
  equipamentos: string;
}

/** Substitui {{variavel}} pelos dados da unidade; variável desconhecida fica como está (para o RT ver). */
export function renderTemplate(md: string, vars: Partial<DocVars>): string {
  return md.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k];
    return v !== undefined && v !== '' ? v : m;
  });
}

const EQUIPMENT_KIND: Record<string, string> = {
  refrigerator: 'geladeira', freezer: 'freezer', cold_room: 'câmara de resfriados', freezer_room: 'câmara de congelados',
  hot_holding: 'estufa / balcão quente', cold_holding: 'balcão refrigerado', other: 'equipamento',
};
/** Lista de equipamentos da unidade em Markdown (para o POP de higienização). */
export function equipmentList(items: Array<{ name: string; kind: string }>): string {
  if (!items.length) return '- (cadastre os equipamentos da unidade para listá-los aqui)';
  return items.map((e) => `- ${e.name} (${EQUIPMENT_KIND[e.kind] ?? 'equipamento'})`).join('\n');
}

export interface PopTemplate { code: string; title: string; body: string }

const HEADER = `**Unidade:** {{unidade}} · **Endereço:** {{endereco}}
**Responsável técnico:** {{rt}} · **Data:** {{data}}

> Modelo inicial gerado pela Rafanutri a partir da RDC 216/2004. Revise com a RT e ajuste à rotina da unidade antes de aprovar.
`;

export const POP_TEMPLATES: PopTemplate[] = [
  {
    code: 'pop-higienizacao',
    title: 'POP 1 — Higienização de instalações, equipamentos, móveis e utensílios',
    body: `# POP 1 — Higienização de instalações, equipamentos, móveis e utensílios

${HEADER}
## Objetivo
Estabelecer os procedimentos de higienização para evitar a contaminação dos alimentos.

## Responsáveis
Manipuladores da unidade, sob supervisão do responsável técnico.

## Equipamentos da unidade
{{equipamentos}}

## Frequência
- Bancadas, utensílios e equipamentos em contato com alimentos: antes e após cada uso.
- Pisos e ralos: ao final de cada turno e sempre que necessário.
- Paredes, portas, janelas e luminárias: conforme cronograma da unidade.
- Geladeiras, freezers e câmaras: limpeza semanal e degelo conforme o fabricante.

## Procedimento
1. Retirar o excesso de sujidades.
2. Lavar com água e detergente neutro.
3. Enxaguar com água potável.
4. Desinfetar com produto saneante registrado na ANVISA, na diluição e no tempo de contato indicados pelo fabricante.
5. Enxaguar quando o produto exigir e deixar secar naturalmente.

## Produtos saneantes
Listar os produtos usados, a diluição e o tempo de contato.

## Monitoramento e registro
O monitoramento é feito pelos checklists de higienização da unidade na Rafanutri. Desvios abrem não conformidade com plano de ação.
`,
  },
  {
    code: 'pop-agua',
    title: 'POP 2 — Higienização do reservatório de água',
    body: `# POP 2 — Higienização do reservatório de água

${HEADER}
## Objetivo
Garantir a potabilidade da água usada no preparo dos alimentos e na higienização.

## Frequência
Higienização do reservatório no máximo a cada 6 meses e sempre que houver acidentes que possam contaminar a água.

## Procedimento
1. Fechar o registro de entrada e esvaziar o reservatório.
2. Remover a sujidade das paredes e do fundo sem usar produtos abrasivos.
3. Enxaguar e retirar a água de enxágue.
4. Desinfetar com solução clorada na concentração indicada, respeitando o tempo de contato.
5. Esvaziar, encher novamente e liberar o uso.

## Registro
Data da higienização, responsável (próprio ou empresa contratada) e comprovante. Laudo de potabilidade quando a água não vier da rede pública.
`,
  },
  {
    code: 'pop-pragas',
    title: 'POP 3 — Controle integrado de vetores e pragas urbanas',
    body: `# POP 3 — Controle integrado de vetores e pragas urbanas

${HEADER}
## Objetivo
Impedir a atração, o abrigo, o acesso e a proliferação de vetores e pragas urbanas.

## Medidas preventivas
- Telas milimétricas removíveis nas janelas e aberturas.
- Portas com fechamento automático e vedação inferior.
- Ralos sifonados com fechamento.
- Lixo em recipientes com tampa e acionamento sem contato manual, retirado com a frequência necessária.
- Inspeção diária na abertura da cozinha (checklist).

## Controle químico
Quando necessário, feito por empresa especializada e licenciada, com comprovante de execução que informe os produtos usados.

## Registro
Comprovantes da empresa contratada e registros dos checklists de abertura.
`,
  },
  {
    code: 'pop-manipuladores',
    title: 'POP 4 — Higiene e saúde dos manipuladores',
    body: `# POP 4 — Higiene e saúde dos manipuladores

${HEADER}
## Objetivo
Garantir que os manipuladores não sejam fonte de contaminação dos alimentos.

## Saúde
- Exames admissionais e periódicos conforme a legislação.
- Manipulador com lesões nas mãos, diarreia, vômito ou outra doença transmissível é afastado da manipulação.

## Higiene pessoal
- Uniforme limpo e de cor clara, trocado diariamente; cabelos presos e protegidos.
- Sem adornos; unhas curtas, limpas e sem esmalte.
- Lavagem e antissepsia das mãos ao entrar na área de produção, após usar o banheiro, tossir, espirrar, manusear lixo ou alimentos crus e sempre que necessário.

## Capacitação
Capacitação periódica em higiene pessoal, manipulação de alimentos e doenças transmitidas por alimentos, registrada na Rafanutri (treinamentos).

## Monitoramento e registro
Checklist diário de higiene dos manipuladores na Rafanutri.
`,
  },
];

// ── Markdown simples (títulos, listas, citação, negrito) sem HTML: vira blocos para o React ──
export type MdInline = { text: string; bold: boolean };
export type MdBlock =
  | { kind: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; inline: MdInline[] }
  | { kind: 'ul' | 'ol'; items: MdInline[][] };

function inline(text: string): MdInline[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => (p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }));
}

export function parseMarkdown(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', inline: inline(para.join(' ')) });
    para = [];
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[m[1]!.length - 1]!, inline: inline(m[2]!) }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(inline(m[1]!)); else blocks.push({ kind: 'ul', items: [inline(m[1]!)] });
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ol') last.items.push(inline(m[1]!)); else blocks.push({ kind: 'ol', items: [inline(m[1]!)] });
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ kind: 'quote', inline: inline(m[1]!) }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export interface DocListItem { id: string; kind: 'pop' | 'manual' | 'other'; code: string | null; title: string; review_every_months: number; version_id: string | null; version: number | null; approved_at: string | null; next_review_on: string | null; has_draft: boolean; acknowledged: boolean; review_overdue: boolean; ack_count: number }
export interface UnitDocuments {
  unit: { id: string; name: string; address: string | null; city: string | null; state: string | null; cnpj: string | null };
  technical_lead: string | null;
  equipment: Array<{ name: string; kind: string }>;
  can_edit: boolean;
  can_approve: boolean;
  team_size: number;
  documents: DocListItem[];
}
export interface DocVersion { id: string; version: number; status: 'draft' | 'approved'; change_summary: string | null; approved_at: string | null; next_review_on: string | null; content_hash: string | null; approved_by_name: string | null; body_md?: string }
export interface DocDetail {
  document: { id: string; unit_id: string; kind: string; code: string | null; title: string; review_every_months: number };
  unit: { id: string; name: string };
  current: DocVersion | null;
  draft: DocVersion | null;
  versions: DocVersion[];
  acknowledged: boolean;
  acks: Array<{ user_id: string; name: string; acknowledged_at: string | null }>;
  can_edit: boolean;
  can_approve: boolean;
}
export interface UnitTrainings {
  unit: { id: string; name: string };
  can_edit: boolean;
  trainings: Array<{ id: string; topic: string; held_on: string; hours: number; instructor: string | null; notes: string | null; attendees: string[] }>;
  team: Array<{ user_id: string; name: string; last_training_on: string | null }>;
}

/** Reciclagem pendente: sem treinamento ou último há mais de `months` meses. */
export function trainingOverdue(last: string | null, today: string, months = 12): boolean {
  if (!last) return true;
  const d = new Date(`${last}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10) < today;
}

/** Documentos com versão vigente que a pessoa ainda não leu. */
export const pendingAcks = (docs: DocListItem[]) => docs.filter((d) => d.version_id && !d.acknowledged);
