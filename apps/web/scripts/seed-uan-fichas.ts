// Carga de demonstração da UAN: ~70 insumos com preço e vínculo à TACO e ~70 fichas técnicas aprovadas
// (desjejum, almoço, lanche e jantar; o suficiente para um ciclo de 4 semanas).
// Usa só a API, com o login do responsável pela empresa (mesmas regras e gatilhos do app), e aprova cada
// ficha com o cálculo do próprio app (lib/uan/techsheets + nutrition-core). Idempotente: insumo ou ficha com
// o mesmo nome não é criado de novo; rascunho com o mesmo nome é completado e aprovado.
//
// Uso (na raiz): SEED_EMAIL=... SEED_PASSWORD=... pnpm db:seed:uan
// Valores de referência para demonstração: preços de atacado aproximados (nov/2026), pesos por porção de
// refeição coletiva para adultos. Revisar com a RT antes de usar em produção de verdade.

import { buildInputs, calculate, sheetAllergens, type SheetCategory, type SheetDetail } from '../lib/uan/techsheets';

const BASE = (process.env.DIRECTUS_URL ?? 'https://rafanutri-api.brunokobi.tech') + '/rafanutri';
const AUTH = (process.env.DIRECTUS_URL ?? 'https://rafanutri-api.brunokobi.tech') + '/auth/login';
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const SERVINGS = 50;

// ── Insumos ──────────────────────────────────────────────────────────────────────────────
type Unit = 'kg' | 'l' | 'un';
interface Ing {
  name: string;
  category: 'produce' | 'meat' | 'dairy' | 'grains' | 'bakery' | 'beverages' | 'frozen' | 'grocery';
  unit: Unit;
  storage: 'ambient' | 'chilled' | 'frozen';
  fc: number;
  taco: number;
  /** R$ por unidade de compra */
  price: number;
  density?: number;
  unitWeight?: number;
  allergens?: string[];
}
const MILK = ['milk', 'lactose'];
export const ING = {
  arroz: { name: 'Arroz tipo 1', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 4, price: 5.5 },
  arrozInt: { name: 'Arroz integral', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 2, price: 7.9 },
  feijao: { name: 'Feijão carioca', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1.02, taco: 562, price: 7.5 },
  feijaoPreto: { name: 'Feijão preto', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1.02, taco: 568, price: 8.2 },
  lentilha: { name: 'Lentilha', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1.02, taco: 578, price: 11.9 },
  grao: { name: 'Grão-de-bico', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1.02, taco: 575, price: 13.5 },
  macarrao: { name: 'Macarrão de sêmola (espaguete)', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 40, price: 6.8, allergens: ['gluten'] },
  farMandioca: { name: 'Farinha de mandioca', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 121, price: 6.5 },
  farTrigo: { name: 'Farinha de trigo', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 35, price: 4.9, allergens: ['gluten'] },
  fuba: { name: 'Fubá de milho', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 43, price: 4.2 },
  aveia: { name: 'Aveia em flocos', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 7, price: 12.9, allergens: ['gluten'] },
  fecula: { name: 'Goma de tapioca (fécula de mandioca)', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 124, price: 9.9 },
  amido: { name: 'Amido de milho', category: 'grains', unit: 'kg', storage: 'ambient', fc: 1, taco: 42, price: 9.5 },
  pao: { name: 'Pão francês', category: 'bakery', unit: 'kg', storage: 'ambient', fc: 1, taco: 53, price: 15.9, allergens: ['gluten'] },
  acem: { name: 'Acém sem gordura', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.1, taco: 329, price: 32.9 },
  moida: { name: 'Carne moída (acém)', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1, taco: 327, price: 34.9 },
  patinho: { name: 'Patinho', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.08, taco: 376, price: 44.9 },
  musculo: { name: 'Músculo bovino', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.12, taco: 372, price: 31.9 },
  peito: { name: 'Peito de frango sem pele', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.05, taco: 409, price: 21.9 },
  coxa: { name: 'Coxa de frango', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.35, taco: 399, price: 14.9 },
  lombo: { name: 'Lombo suíno', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1.05, taco: 433, price: 26.9 },
  linguica: { name: 'Linguiça de porco', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1, taco: 421, price: 22.9 },
  pescada: { name: 'Filé de pescada', category: 'frozen', unit: 'kg', storage: 'frozen', fc: 1.05, taco: 307, price: 39.9, allergens: ['fish'] },
  ovo: { name: 'Ovo de galinha', category: 'dairy', unit: 'un', storage: 'chilled', fc: 1.12, taco: 489, price: 0.75, unitWeight: 56, allergens: ['eggs'] },
  presunto: { name: 'Presunto cozido', category: 'meat', unit: 'kg', storage: 'chilled', fc: 1, taco: 439, price: 32.9 },
  mussarela: { name: 'Queijo muçarela', category: 'dairy', unit: 'kg', storage: 'chilled', fc: 1, taco: 463, price: 42.9, allergens: MILK },
  iogurte: { name: 'Iogurte natural', category: 'dairy', unit: 'kg', storage: 'chilled', fc: 1, taco: 448, price: 13.9, allergens: MILK },
  leite: { name: 'Leite integral', category: 'dairy', unit: 'l', storage: 'chilled', fc: 1, taco: 458, price: 5.49, density: 1.03, allergens: MILK },
  manteiga: { name: 'Manteiga com sal', category: 'dairy', unit: 'kg', storage: 'chilled', fc: 1, taco: 261, price: 49.9, allergens: MILK },
  creme: { name: 'Creme de leite', category: 'dairy', unit: 'kg', storage: 'ambient', fc: 1, taco: 447, price: 22.9, allergens: MILK },
  condensado: { name: 'Leite condensado', category: 'dairy', unit: 'kg', storage: 'ambient', fc: 1, taco: 453, price: 18.9, allergens: MILK },
  batata: { name: 'Batata inglesa', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.18, taco: 92, price: 5.9 },
  batataDoce: { name: 'Batata-doce', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.15, taco: 89, price: 5.5 },
  mandioca: { name: 'Mandioca', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.4, taco: 130, price: 4.9 },
  cenoura: { name: 'Cenoura', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.17, taco: 110, price: 4.5 },
  abobrinha: { name: 'Abobrinha italiana', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.05, taco: 71, price: 5.9 },
  abobora: { name: 'Abóbora cabotiá', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.35, taco: 65, price: 4.2 },
  chuchu: { name: 'Chuchu', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.3, taco: 113, price: 3.9 },
  beterraba: { name: 'Beterraba', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.25, taco: 98, price: 4.9 },
  brocolis: { name: 'Brócolis', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.6, taco: 101, price: 12.9 },
  couve: { name: 'Couve-manteiga', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.25, taco: 115, price: 14.9 },
  repolho: { name: 'Repolho branco', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.2, taco: 149, price: 3.5 },
  alface: { name: 'Alface crespa', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.4, taco: 78, price: 9.9 },
  tomate: { name: 'Tomate', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.1, taco: 157, price: 7.9 },
  pepino: { name: 'Pepino', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.1, taco: 142, price: 4.9 },
  cebola: { name: 'Cebola', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.1, taco: 107, price: 4.9 },
  alho: { name: 'Alho', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.15, taco: 82, price: 29.9 },
  pimentao: { name: 'Pimentão verde', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.25, taco: 144, price: 9.9 },
  vagem: { name: 'Vagem', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.15, taco: 162, price: 11.9 },
  salsa: { name: 'Salsa (cheiro-verde)', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.3, taco: 153, price: 24.9 },
  milho: { name: 'Milho verde em conserva', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 45, price: 14.9 },
  ervilha: { name: 'Ervilha em conserva', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 560, price: 14.9 },
  banana: { name: 'Banana-prata', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.5, taco: 182, price: 6.5 },
  maca: { name: 'Maçã Fuji', category: 'produce', unit: 'kg', storage: 'chilled', fc: 1.1, taco: 222, price: 9.9 },
  laranja: { name: 'Laranja-pera', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.5, taco: 214, price: 3.9 },
  mamao: { name: 'Mamão formosa', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.4, taco: 225, price: 5.9 },
  melancia: { name: 'Melancia', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.8, taco: 235, price: 2.9 },
  abacaxi: { name: 'Abacaxi', category: 'produce', unit: 'kg', storage: 'ambient', fc: 1.9, taco: 164, price: 6.5 },
  maracuja: { name: 'Maracujá', category: 'produce', unit: 'kg', storage: 'ambient', fc: 2, taco: 232, price: 9.9 },
  limao: { name: 'Limão-taiti', category: 'produce', unit: 'kg', storage: 'ambient', fc: 2, taco: 220, price: 4.9 },
  oleo: { name: 'Óleo de soja', category: 'grocery', unit: 'l', storage: 'ambient', fc: 1, taco: 272, price: 7.9, density: 0.92 },
  azeite: { name: 'Azeite de oliva extravirgem', category: 'grocery', unit: 'l', storage: 'ambient', fc: 1, taco: 260, price: 49.9, density: 0.92 },
  acucar: { name: 'Açúcar refinado', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 494, price: 4.79 },
  sal: { name: 'Sal', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 517, price: 2.49 },
  extrato: { name: 'Extrato de tomate', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 158, price: 18.9 },
  cafe: { name: 'Café torrado e moído', category: 'beverages', unit: 'kg', storage: 'ambient', fc: 1, taco: 511, price: 39.9 },
  gelatina: { name: 'Gelatina em pó (sabores)', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 515, price: 39.9 },
  fermento: { name: 'Fermento químico em pó', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 513, price: 39.9 },
  chocolate: { name: 'Chocolate ao leite', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 495, price: 49.9, allergens: [...MILK, 'soy'] },
  mel: { name: 'Mel de abelha', category: 'grocery', unit: 'kg', storage: 'ambient', fc: 1, taco: 507, price: 39.9 },
} satisfies Record<string, Ing>;
type Key = keyof typeof ING;

// ── Fichas ───────────────────────────────────────────────────────────────────────────────
/** [insumo, gramas brutas por porção, FC próprio do item (opcional)] ou ['sub', gramas da preparação pronta] */
export type Line = [Key, number, number?] | ['sub:molho', number];
export interface Recipe {
  name: string;
  category: SheetCategory;
  /** Índice de cocção, ou `yieldG`: rendimento por porção (preparações com água, como sopas e bebidas) */
  ic?: number;
  yieldG?: number;
  minutes: number;
  equipment?: string;
  items: Line[];
  steps: Array<string | [string, number]>;
}

// Passos com controle (texto, temperatura-alvo em °C): ficam marcados como ponto crítico
const COOK: [string, number] = ['Cozinhar até o centro geométrico atingir no mínimo 70 °C', 70];
const HOLD: [string, number] = ['Manter na distribuição quente a 60 °C ou mais (até 6 h)', 60];
const COLD: [string, number] = ['Manter refrigerado e na distribuição fria a 5 °C ou menos', 5];
const WASH = 'Higienizar em solução clorada (100 a 200 ppm, 15 min) e enxaguar em água potável';
const THAW: [string, number] = ['Descongelar sob refrigeração (5 °C ou menos), nunca em temperatura ambiente', 5];

export const RECIPES: Recipe[] = [
  // Base usada como sub-receita
  { name: 'Molho de tomate caseiro', category: 'sauce', ic: 0.7, minutes: 50, equipment: 'Caldeirão', items: [['tomate', 120], ['extrato', 10], ['cebola', 10], ['alho', 2], ['azeite', 4], ['acucar', 1], ['sal', 1]],
    steps: [WASH, 'Refogar alho e cebola no azeite', 'Juntar tomate picado, extrato, açúcar e sal; cozinhar em fogo baixo por 40 min', COOK] },

  // Desjejum e lanches
  { name: 'Café coado', category: 'beverage', yieldG: 150, minutes: 15, equipment: 'Cafeteira industrial', items: [['cafe', 8], ['acucar', 8]], steps: ['Coar com água a 92-96 °C', 'Adoçar e servir em até 1 h'] },
  { name: 'Café com leite', category: 'beverage', yieldG: 180, minutes: 15, items: [['cafe', 5], ['leite', 100], ['acucar', 8]], steps: ['Coar o café', ['Aquecer o leite até ferver', 90], 'Misturar e adoçar'] },
  { name: 'Pão francês com manteiga', category: 'bread', minutes: 5, items: [['pao', 50], ['manteiga', 5]], steps: ['Abrir o pão e passar a manteiga na hora de servir'] },
  { name: 'Misto frio', category: 'bread', minutes: 10, items: [['pao', 50], ['presunto', 15], ['mussarela', 15]], steps: ['Montar com pão, presunto e queijo', COLD] },
  { name: 'Ovos mexidos', category: 'main', ic: 0.9, minutes: 15, equipment: 'Frigideira ou chapa', items: [['ovo', 112], ['manteiga', 3], ['sal', 0.5]], steps: ['Lavar os ovos só na hora do preparo', 'Bater e mexer na manteiga até firmar', COOK, HOLD] },
  { name: 'Cuscuz de milho', category: 'side', yieldG: 150, minutes: 30, equipment: 'Cuscuzeira', items: [['fuba', 60], ['manteiga', 4], ['sal', 1]], steps: ['Hidratar o fubá com água e sal por 10 min', 'Cozinhar no vapor por 15 min', 'Finalizar com manteiga', HOLD] },
  { name: 'Tapioca com queijo', category: 'bread', yieldG: 65, minutes: 10, equipment: 'Frigideira antiaderente', items: [['fecula', 50], ['mussarela', 20]], steps: ['Peneirar a goma na frigideira quente', 'Rechear com queijo e dobrar'] },
  { name: 'Mingau de aveia', category: 'other', yieldG: 200, minutes: 15, items: [['aveia', 25], ['leite', 180], ['acucar', 10]], steps: ['Cozinhar a aveia no leite, mexendo, por 5 min após ferver', HOLD] },
  { name: 'Bolo de cenoura com chocolate', category: 'dessert', ic: 0.9, minutes: 60, equipment: 'Forno e liquidificador', items: [['farTrigo', 25], ['cenoura', 20], ['ovo', 15], ['oleo', 10], ['acucar', 25], ['fermento', 1], ['chocolate', 8]],
    steps: [WASH, 'Bater cenoura, ovos, óleo e açúcar; juntar farinha e fermento', ['Assar a 180 °C por 40 min', 180], 'Cobrir com chocolate derretido'] },
  { name: 'Bolo de fubá', category: 'dessert', ic: 0.9, minutes: 55, equipment: 'Forno', items: [['fuba', 20], ['farTrigo', 10], ['leite', 20], ['ovo', 15], ['oleo', 8], ['acucar', 20], ['fermento', 1]],
    steps: ['Misturar os líquidos e depois os secos', ['Assar a 180 °C por 40 min', 180]] },
  { name: 'Vitamina de banana com aveia', category: 'beverage', yieldG: 220, minutes: 10, equipment: 'Liquidificador', items: [['banana', 80], ['leite', 150], ['aveia', 10], ['acucar', 5]], steps: ['Bater tudo no liquidificador', COLD] },
  { name: 'Iogurte com mel e aveia', category: 'other', minutes: 5, items: [['iogurte', 120], ['mel', 10], ['aveia', 15]], steps: ['Montar na hora de servir', COLD] },
  { name: 'Salada de frutas', category: 'dessert', minutes: 25, items: [['banana', 40], ['maca', 40], ['laranja', 40], ['mamao', 40], ['abacaxi', 40]], steps: [WASH, 'Picar em cubos e misturar com o suco da laranja', COLD] },

  // Arroz, feijão e acompanhamentos
  { name: 'Arroz branco', category: 'side', ic: 2.6, minutes: 30, equipment: 'Caldeirão ou forno combinado', items: [['arroz', 60], ['oleo', 2], ['alho', 1], ['cebola', 3], ['sal', 1]], steps: ['Refogar alho e cebola', 'Juntar o arroz e a água fervente (2 partes)', COOK, HOLD] },
  { name: 'Arroz integral', category: 'side', ic: 2.5, minutes: 45, items: [['arrozInt', 60], ['oleo', 2], ['alho', 1], ['sal', 1]], steps: ['Refogar o alho e o arroz', 'Cozinhar com 3 partes de água por 35 min', COOK, HOLD] },
  { name: 'Feijão carioca', category: 'side', ic: 3.3, minutes: 90, equipment: 'Panela de pressão industrial', items: [['feijao', 40], ['oleo', 2], ['alho', 1.5], ['cebola', 4], ['sal', 1]], steps: ['Catar, lavar e deixar de molho por 8 h (refrigerado)', 'Cozinhar na pressão por 30 min', 'Temperar com refogado de alho e cebola', COOK, HOLD] },
  { name: 'Feijão preto', category: 'side', ic: 3.3, minutes: 90, equipment: 'Panela de pressão industrial', items: [['feijaoPreto', 40], ['oleo', 2], ['alho', 1.5], ['cebola', 4], ['sal', 1]], steps: ['Catar, lavar e deixar de molho por 8 h (refrigerado)', 'Cozinhar na pressão por 35 min', 'Temperar com refogado de alho e cebola', COOK, HOLD] },
  { name: 'Lentilha refogada', category: 'side', ic: 2.8, minutes: 40, items: [['lentilha', 40], ['cebola', 5], ['alho', 1], ['oleo', 2], ['sal', 1]], steps: ['Catar e lavar', 'Cozinhar por 25 min sem desmanchar', 'Refogar com alho e cebola', COOK, HOLD] },
  { name: 'Macarrão alho e óleo', category: 'side', ic: 2.3, minutes: 25, items: [['macarrao', 60], ['azeite', 4], ['alho', 3], ['salsa', 1], ['sal', 1]], steps: ['Cozinhar al dente em água com sal', 'Dourar o alho no azeite e misturar com a salsa', HOLD] },
  { name: 'Purê de batata', category: 'garnish', ic: 0.95, minutes: 40, items: [['batata', 150], ['leite', 20], ['manteiga', 5], ['sal', 1]], steps: [WASH, 'Cozinhar a batata e amassar quente', 'Juntar leite quente e manteiga', COOK, HOLD] },
  { name: 'Farofa de manteiga', category: 'garnish', ic: 0.95, minutes: 15, items: [['farMandioca', 20], ['manteiga', 5], ['cebola', 5], ['sal', 0.5]], steps: ['Dourar a cebola na manteiga', 'Juntar a farinha e torrar mexendo'] },
  { name: 'Polenta cremosa', category: 'side', yieldG: 180, minutes: 35, items: [['fuba', 35], ['oleo', 2], ['sal', 1]], steps: ['Dissolver o fubá em água fria', 'Cozinhar mexendo por 25 min', COOK, HOLD] },
  { name: 'Mandioca cozida na manteiga', category: 'garnish', ic: 1, minutes: 45, items: [['mandioca', 150], ['sal', 1], ['manteiga', 3]], steps: ['Descascar, lavar e cozinhar até amaciar', 'Regar com manteiga', HOLD] },
  { name: 'Batata-doce assada', category: 'garnish', ic: 0.8, minutes: 50, equipment: 'Forno', items: [['batataDoce', 150], ['azeite', 3], ['sal', 0.5]], steps: [WASH, 'Cortar em rodelas, temperar e assar a 200 °C por 35 min', HOLD] },

  // Pratos principais
  { name: 'Carne de panela com batata', category: 'main', ic: 0.85, minutes: 120, equipment: 'Panela de pressão industrial', items: [['acem', 130], ['batata', 60], ['cebola', 10], ['alho', 2], ['tomate', 15], ['extrato', 5], ['oleo', 3], ['sal', 1.5]],
    steps: ['Cortar a carne em cubos de 3 cm', 'Selar, refogar os temperos e cozinhar na pressão por 40 min', 'Juntar a batata e cozinhar por mais 10 min', COOK, HOLD] },
  { name: 'Bife acebolado', category: 'main', ic: 0.75, minutes: 40, equipment: 'Chapa', items: [['patinho', 130], ['cebola', 30], ['oleo', 3], ['alho', 2], ['sal', 1.2]], steps: ['Temperar os bifes', 'Grelhar na chapa quente', 'Cobrir com a cebola refogada', COOK, HOLD] },
  { name: 'Carne moída com legumes', category: 'main', ic: 0.85, minutes: 40, items: [['moida', 110], ['cenoura', 20], ['chuchu', 25], ['cebola', 10], ['alho', 2], ['extrato', 5], ['oleo', 3], ['sal', 1]], steps: [WASH, 'Refogar a carne até perder a cor rosada', 'Juntar os legumes em cubos e cozinhar', COOK, HOLD] },
  { name: 'Picadinho de carne com cenoura', category: 'main', ic: 0.85, minutes: 90, items: [['musculo', 130], ['cenoura', 25], ['cebola', 10], ['alho', 2], ['tomate', 15], ['oleo', 3], ['sal', 1.2]], steps: ['Cortar em cubos pequenos', 'Refogar e cozinhar na pressão por 30 min', 'Juntar a cenoura', COOK, HOLD] },
  { name: 'Estrogonofe de frango', category: 'main', ic: 0.85, minutes: 40, items: [['peito', 120], ['creme', 25], ['extrato', 6], ['cebola', 10], ['alho', 2], ['oleo', 3], ['sal', 1]], steps: ['Cortar o frango em tiras', 'Refogar, juntar o extrato e cozinhar', 'Desligar e misturar o creme de leite', COOK, HOLD] },
  { name: 'Frango assado com limão', category: 'main', ic: 0.75, minutes: 70, equipment: 'Forno combinado', items: [['coxa', 180], ['alho', 3], ['limao', 5], ['oleo', 3], ['sal', 1.5]], steps: ['Temperar com alho, limão e sal e refrigerar por 2 h', ['Assar a 200 °C por 45 min', 200], COOK, HOLD] },
  { name: 'Frango grelhado', category: 'main', ic: 0.75, minutes: 35, equipment: 'Chapa', items: [['peito', 130], ['azeite', 3], ['alho', 2], ['limao', 5], ['sal', 1]], steps: ['Temperar os filés', 'Grelhar dos dois lados', COOK, HOLD] },
  { name: 'Frango xadrez', category: 'main', ic: 0.85, minutes: 40, items: [['peito', 110], ['pimentao', 20], ['cebola', 15], ['cenoura', 15], ['amido', 3], ['oleo', 4], ['sal', 1]], steps: [WASH, 'Saltear o frango em cubos', 'Juntar os legumes e engrossar com o amido', COOK, HOLD] },
  { name: 'Lombo suíno assado', category: 'main', ic: 0.7, minutes: 100, equipment: 'Forno combinado', items: [['lombo', 140], ['alho', 3], ['cebola', 10], ['limao', 5], ['oleo', 3], ['sal', 1.5]], steps: ['Temperar e refrigerar por 4 h', ['Assar coberto a 180 °C por 60 min e descoberto por 15 min', 180], COOK, HOLD] },
  { name: 'Pescada ao molho de tomate', category: 'main', ic: 0.9, minutes: 45, items: [['pescada', 130], ['sub:molho', 60], ['cebola', 10], ['oleo', 3], ['sal', 1]], steps: [THAW, 'Temperar os filés e dispor em assadeira', 'Cobrir com o molho e assar a 200 °C por 25 min', COOK, HOLD] },
  { name: 'Peixe empanado assado', category: 'main', ic: 0.85, minutes: 45, equipment: 'Forno', items: [['pescada', 130], ['farTrigo', 20], ['ovo', 15], ['oleo', 5], ['limao', 5], ['sal', 1]], steps: [THAW, 'Passar no ovo e na farinha', ['Assar a 220 °C por 20 min', 220], COOK, HOLD] },
  { name: 'Omelete de legumes', category: 'main', ic: 0.85, minutes: 25, items: [['ovo', 168], ['tomate', 20], ['cebola', 10], ['abobrinha', 20], ['mussarela', 10], ['oleo', 2], ['sal', 1]], steps: [WASH, 'Bater os ovos e misturar os legumes picados', 'Assar em assadeira untada a 180 °C por 20 min', COOK, HOLD] },
  { name: 'Almôndegas ao sugo', category: 'main', ic: 0.85, minutes: 60, items: [['moida', 110], ['ovo', 10], ['farTrigo', 8], ['cebola', 8], ['alho', 2], ['sub:molho', 60], ['sal', 1]], steps: ['Misturar carne, ovo, farinha e temperos e modelar', 'Assar a 200 °C por 15 min', 'Cozinhar no molho por 15 min', COOK, HOLD] },
  { name: 'Feijoada', category: 'main', ic: 2, minutes: 180, equipment: 'Panela de pressão industrial', items: [['feijaoPreto', 50], ['linguica', 40], ['lombo', 40], ['cebola', 8], ['alho', 3], ['oleo', 2], ['sal', 1]], steps: ['Deixar o feijão de molho por 8 h (refrigerado)', 'Cozinhar o feijão com as carnes', 'Temperar com refogado', COOK, HOLD] },
  { name: 'Escondidinho de carne', category: 'main', ic: 0.9, minutes: 80, equipment: 'Forno', items: [['moida', 90], ['mandioca', 150], ['manteiga', 5], ['leite', 20], ['mussarela', 15], ['cebola', 8], ['alho', 2], ['sal', 1.5]], steps: ['Cozinhar e amassar a mandioca com leite e manteiga', 'Refogar a carne', 'Montar em camadas, cobrir com queijo e gratinar', COOK, HOLD] },
  { name: 'Grão-de-bico ensopado', category: 'main', ic: 2, minutes: 70, items: [['grao', 60], ['tomate', 30], ['cebola', 10], ['cenoura', 20], ['alho', 2], ['azeite', 4], ['sal', 1]], steps: ['Deixar de molho por 12 h (refrigerado)', 'Cozinhar na pressão por 25 min', 'Ensopar com tomate e cenoura', COOK, HOLD] },
  { name: 'Macarronada à bolonhesa', category: 'main', ic: 1.35, minutes: 50, items: [['macarrao', 70], ['moida', 70], ['sub:molho', 70], ['mussarela', 5], ['sal', 1]], steps: ['Cozinhar o macarrão al dente', 'Refogar a carne e juntar o molho', 'Misturar e finalizar com queijo', COOK, HOLD] },
  { name: 'Galinhada', category: 'main', ic: 1.8, minutes: 60, items: [['coxa', 120], ['arroz', 50], ['milho', 15], ['ervilha', 10], ['cebola', 8], ['alho', 2], ['oleo', 3], ['sal', 1.5]], steps: ['Dourar o frango', 'Juntar o arroz, a água e cozinhar', 'Finalizar com milho e ervilha', COOK, HOLD] },

  // Guarnições
  { name: 'Abobrinha refogada', category: 'garnish', ic: 0.8, minutes: 20, items: [['abobrinha', 120], ['cebola', 8], ['alho', 1], ['oleo', 2], ['sal', 0.8]], steps: [WASH, 'Refogar em cubos até ficar macia', HOLD] },
  { name: 'Cenoura e vagem salteadas', category: 'garnish', ic: 0.85, minutes: 25, items: [['cenoura', 60], ['vagem', 60], ['azeite', 3], ['sal', 0.8]], steps: [WASH, 'Branquear e saltear no azeite', HOLD] },
  { name: 'Couve refogada', category: 'garnish', ic: 0.7, minutes: 15, items: [['couve', 70], ['alho', 2], ['oleo', 3], ['sal', 0.5]], steps: [WASH, 'Fatiar fino e refogar rapidamente no alho', HOLD] },
  { name: 'Chuchu refogado', category: 'garnish', ic: 0.8, minutes: 25, items: [['chuchu', 130], ['cebola', 8], ['oleo', 2], ['salsa', 1], ['sal', 0.8]], steps: [WASH, 'Refogar em cubos até ficar macio', HOLD] },
  { name: 'Brócolis no alho', category: 'garnish', ic: 0.85, minutes: 20, items: [['brocolis', 120], ['alho', 2], ['azeite', 3], ['sal', 0.6]], steps: [WASH, 'Cozinhar no vapor por 5 min e saltear no alho', HOLD] },
  { name: 'Abóbora refogada', category: 'garnish', ic: 0.8, minutes: 30, items: [['abobora', 130], ['cebola', 8], ['alho', 1], ['oleo', 2], ['sal', 0.6]], steps: [WASH, 'Refogar em cubos com pouca água até amaciar', HOLD] },
  { name: 'Repolho refogado', category: 'garnish', ic: 0.75, minutes: 20, items: [['repolho', 120], ['cebola', 8], ['tomate', 15], ['oleo', 2], ['sal', 0.8]], steps: [WASH, 'Fatiar e refogar com tomate', HOLD] },
  { name: 'Batata sauté', category: 'garnish', ic: 0.9, minutes: 35, items: [['batata', 130], ['manteiga', 5], ['salsa', 1], ['sal', 0.8]], steps: [WASH, 'Cozinhar em cubos e saltear na manteiga com salsa', HOLD] },
  { name: 'Legumes no vapor', category: 'garnish', ic: 0.9, minutes: 25, equipment: 'Forno combinado (vapor)', items: [['cenoura', 40], ['brocolis', 40], ['abobrinha', 40], ['vagem', 30], ['sal', 0.5]], steps: [WASH, 'Cozinhar no vapor por 8 a 10 min', HOLD] },

  // Saladas (servidas cruas)
  { name: 'Salada de alface e tomate', category: 'salad', minutes: 20, items: [['alface', 30], ['tomate', 50], ['azeite', 2], ['sal', 0.3]], steps: [WASH, 'Montar e temperar na hora', COLD] },
  { name: 'Salada de repolho com cenoura', category: 'salad', minutes: 20, items: [['repolho', 40], ['cenoura', 30], ['limao', 3], ['azeite', 2], ['sal', 0.3]], steps: [WASH, 'Fatiar fino e ralar', COLD] },
  { name: 'Beterraba ralada', category: 'salad', minutes: 15, items: [['beterraba', 70], ['limao', 3], ['azeite', 2], ['sal', 0.3]], steps: [WASH, 'Ralar no ralo grosso', COLD] },
  { name: 'Salada de pepino', category: 'salad', minutes: 15, items: [['pepino', 70], ['cebola', 5], ['azeite', 2], ['sal', 0.3]], steps: [WASH, 'Fatiar e temperar na hora', COLD] },
  { name: 'Vinagrete', category: 'salad', minutes: 20, items: [['tomate', 40], ['cebola', 15], ['pimentao', 15], ['salsa', 2], ['azeite', 3], ['limao', 4], ['sal', 0.3]], steps: [WASH, 'Picar em cubos pequenos e temperar', COLD] },
  { name: 'Salada de batata com ovo', category: 'salad', ic: 0.95, minutes: 40, items: [['batata', 80], ['cenoura', 25], ['ovo', 25], ['iogurte', 20], ['salsa', 1], ['sal', 0.5]], steps: [WASH, 'Cozinhar batata, cenoura e ovos', ['Resfriar a 10 °C em até 2 h', 10], 'Misturar com o iogurte', COLD] },
  { name: 'Salada de grão-de-bico', category: 'salad', ic: 2, minutes: 30, items: [['grao', 30], ['tomate', 30], ['cebola', 8], ['salsa', 2], ['azeite', 3], ['limao', 3], ['sal', 0.5]], steps: ['Cozinhar o grão-de-bico e resfriar', WASH, 'Misturar com os legumes picados', COLD] },

  // Sopas
  { name: 'Sopa de legumes com carne', category: 'soup', yieldG: 300, minutes: 70, items: [['musculo', 50], ['batata', 50], ['cenoura', 30], ['chuchu', 30], ['macarrao', 10], ['cebola', 8], ['sal', 1.5]], steps: [WASH, 'Cozinhar a carne em cubos', 'Juntar os legumes e por último o macarrão', COOK, HOLD] },
  { name: 'Canja de galinha', category: 'soup', yieldG: 300, minutes: 60, items: [['peito', 50], ['arroz', 20], ['cenoura', 20], ['batata', 30], ['cebola', 8], ['salsa', 1], ['sal', 1.5]], steps: ['Cozinhar e desfiar o frango', 'Juntar arroz e legumes no caldo', COOK, HOLD] },
  { name: 'Caldo verde', category: 'soup', yieldG: 300, minutes: 50, items: [['batata', 120], ['couve', 25], ['linguica', 25], ['cebola', 8], ['alho', 2], ['azeite', 3], ['sal', 1.5]], steps: [WASH, 'Cozinhar e bater a batata', 'Juntar a linguiça dourada e a couve fatiada', COOK, HOLD] },
  { name: 'Sopa de lentilha', category: 'soup', yieldG: 280, minutes: 50, items: [['lentilha', 35], ['cenoura', 20], ['cebola', 8], ['alho', 2], ['azeite', 3], ['sal', 1.2]], steps: ['Refogar alho e cebola', 'Cozinhar a lentilha com a cenoura por 30 min', COOK, HOLD] },

  // Sobremesas e frutas
  { name: 'Gelatina', category: 'dessert', yieldG: 100, minutes: 15, items: [['gelatina', 12]], steps: ['Dissolver em água quente e completar com água fria', COLD] },
  { name: 'Pudim de leite condensado', category: 'dessert', ic: 0.9, minutes: 90, equipment: 'Forno (banho-maria)', items: [['condensado', 40], ['leite', 40], ['ovo', 20], ['acucar', 8]], steps: ['Caramelizar o açúcar na fôrma', 'Bater e assar em banho-maria a 180 °C por 50 min', COOK, COLD] },
  { name: 'Mousse de maracujá', category: 'dessert', minutes: 20, items: [['condensado', 30], ['creme', 25], ['maracuja', 30]], steps: [WASH, 'Bater o leite condensado, o creme e o suco', COLD] },
  { name: 'Arroz-doce', category: 'dessert', yieldG: 120, minutes: 50, items: [['arroz', 15], ['leite', 70], ['acucar', 12]], steps: ['Cozinhar o arroz em água e depois no leite com açúcar', COOK, COLD] },
  { name: 'Banana-prata (fruta)', category: 'dessert', minutes: 5, items: [['banana', 120]], steps: ['Lavar e servir inteira'] },
  { name: 'Laranja em gomos', category: 'dessert', minutes: 15, items: [['laranja', 180]], steps: [WASH, 'Descascar e servir em gomos', COLD] },
  { name: 'Melancia em fatia', category: 'dessert', minutes: 15, items: [['melancia', 250]], steps: [WASH, 'Cortar em fatias', COLD] },
  { name: 'Mamão em cubos', category: 'dessert', minutes: 15, items: [['mamao', 180]], steps: [WASH, 'Descascar, retirar sementes e cortar', COLD] },

  // Bebidas
  { name: 'Suco de laranja natural', category: 'beverage', yieldG: 200, minutes: 20, equipment: 'Espremedor', items: [['laranja', 400, 2.4]], steps: [WASH, 'Espremer e servir em até 2 h', COLD] },
  { name: 'Suco de abacaxi', category: 'beverage', yieldG: 250, minutes: 15, equipment: 'Liquidificador', items: [['abacaxi', 120], ['acucar', 10]], steps: [WASH, 'Bater com água gelada e coar', COLD] },
  { name: 'Limonada', category: 'beverage', yieldG: 250, minutes: 15, items: [['limao', 40], ['acucar', 15]], steps: [WASH, 'Espremer, adoçar e completar com água gelada', COLD] },
];

// ── API ──────────────────────────────────────────────────────────────────────────────────
let token = '';
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
  if (!res.ok) {
    const e = json?.errors?.[0];
    throw new Error(`${method} ${path}: ${res.status} ${e?.extensions?.fields ? JSON.stringify(e.extensions.fields) : (e?.message ?? '')}`);
  }
  return json?.data as T;
}
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const g = (n: number) => String(Math.round(n * SERVINGS * 10) / 10);

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Defina SEED_EMAIL e SEED_PASSWORD (responsável pela empresa com o módulo UAN).');
    process.exit(2);
  }
  const login = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!login.ok) throw new Error(`login: ${login.status}`);
  token = ((await login.json()) as { data: { access_token: string } }).data.access_token;

  const orgs = await api<Array<{ id: string; name: string; role: string; modules: string[] | null }>>('/me/organizations');
  const org = orgs.find((o) => o.role === 'owner' && o.modules?.includes('uan'));
  if (!org) throw new Error('Nenhuma empresa com o módulo UAN em que você seja o responsável.');
  console.log(`Empresa: ${org.name}`);

  // Fornecedor de exemplo
  const sups = await api<{ items: Array<{ id: string; name: string }> }>(`/uan/organizations/${org.id}/suppliers`);
  const SUP_NAME = 'Distribuidora Exemplo (demonstração)';
  const supplierId = sups.items.find((s) => s.name === SUP_NAME)?.id
    ?? (await api<{ id: string }>(`/uan/organizations/${org.id}/suppliers`, 'POST', { name: SUP_NAME, contact_name: '', phone: '', email: '', cnpj: '', notes: 'Fornecedor fictício criado pela carga de demonstração.' })).id;

  // Insumos (cria o que falta; registra preço quando não houver preço vigente)
  const existing = await api<{ items: Array<{ id: string; name: string; price_cents: number | null }> }>(`/uan/organizations/${org.id}/ingredients`);
  const byName = new Map(existing.items.map((i) => [norm(i.name), i]));
  const ids = {} as Record<Key, string>;
  let created = 0;
  for (const [key, def] of Object.entries(ING) as Array<[Key, Ing]>) {
    let row = byName.get(norm(def.name));
    if (!row) {
      const r = await api<{ id: string }>(`/uan/organizations/${org.id}/ingredients`, 'POST', {
        name: def.name, category: def.category, purchase_unit: def.unit, storage: def.storage, default_fc: String(def.fc),
        density_g_ml: def.density ? String(def.density) : '', unit_weight_g: def.unitWeight ? String(def.unitWeight) : '', pack_grams: '', min_stock: '',
        allergens: def.allergens ?? [], food_id: def.taco,
      });
      row = { id: r.id, name: def.name, price_cents: null };
      created++;
    }
    if (row.price_cents === null) await api(`/uan/ingredients/${row.id}/prices`, 'POST', { price: def.price.toFixed(2), supplier_id: supplierId, valid_from: null });
    ids[key] = row.id;
  }
  console.log(`Insumos: ${created} criados, ${Object.keys(ING).length - created} já existiam`);

  // Fichas
  const list = await api<{ items: Array<{ id: string; name: string; status: string }> }>(`/uan/organizations/${org.id}/tech-sheets`);
  const sheets = new Map<string, { id: string; status: string }>();
  for (const s of list.items) {
    const cur = sheets.get(norm(s.name));
    if (!cur || (cur.status !== 'approved' && s.status === 'approved')) sheets.set(norm(s.name), s);
  }
  let approved = 0;
  let skipped = 0;
  let molhoId: string | null = null;
  for (const r of RECIPES) {
    const found = sheets.get(norm(r.name));
    if (found?.status === 'approved') {
      if (r.category === 'sauce') molhoId = found.id;
      skipped++;
      continue;
    }
    const id = found?.id ?? (await api<{ id: string }>(`/uan/organizations/${org.id}/tech-sheets`, 'POST', { name: r.name, category: r.category, servings: SERVINGS })).id;
    const items = r.items.map((line) => {
      if (line[0] === 'sub:molho') {
        if (!molhoId) throw new Error('O molho de tomate precisa ser aprovado antes das fichas que o usam.');
        return { ingredient_id: null, sub_sheet_id: molhoId, gross_g: g(line[1]), fc: null, note: null };
      }
      const [key, grams, fc] = line;
      return { ingredient_id: ids[key], sub_sheet_id: null, gross_g: g(grams), fc: String(fc ?? ING[key].fc), note: null };
    });
    await api(`/uan/tech-sheets/${id}`, 'PUT', {
      name: r.name, category: r.category, servings: SERVINGS,
      cooked_weight_g: r.yieldG ? String(r.yieldG * SERVINGS) : '', cooking_index: r.ic ? String(r.ic) : '',
      prep_minutes: String(r.minutes), equipment: r.equipment ?? '', notes: 'Ficha de demonstração (carga automática). Revisar com a RT.',
      items,
      steps: r.steps.map((s) => (typeof s === 'string' ? { text: s, critical: false, target_temp: null } : { text: s[0], critical: true, target_temp: String(s[1]) })),
    });
    const detail = await api<SheetDetail>(`/uan/tech-sheets/${id}`);
    const result = calculate(id, buildInputs(id, detail.graph, detail.catalog));
    if (!result) throw new Error(`${r.name}: o cálculo não fechou`);
    const allergens = sheetAllergens(id, detail.graph, detail.catalog);
    await api(`/uan/tech-sheets/${id}/approve`, 'POST', { computed: { ...result, allergens } });
    if (r.category === 'sauce') molhoId = id;
    approved++;
    console.log(`  ✓ ${r.name} — ${result.portionG} g/porção, R$ ${(result.costPerServingCents / 100).toFixed(2)}, ${Math.round(result.perServing.energy_kcal ?? 0)} kcal`);
  }
  console.log(`Fichas: ${approved} aprovadas agora, ${skipped} já estavam aprovadas (${RECIPES.length} no total)`);
}

// Só roda quando chamado como script (o teste importa os dados sem disparar a carga)
if (process.argv[1]?.endsWith('seed-uan-fichas.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
