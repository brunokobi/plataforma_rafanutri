// Catálogo básico de insumos para começar a UAN (botão "Adicionar catálogo básico").
// Fatores de correção (FC) são valores de referência de tabelas usuais de UAN (Ornellas; Araújo e Guerra)
// e devem ser ajustados pela unidade conforme a sua própria medição. Sem preço e sem ligação a alimento:
// a unidade completa depois. Nomes já cadastrados (sem diferença de maiúsculas/acentos) são pulados.

// [nome, categoria, unidade de compra, armazenamento, FC, extra]
// extra: { unit_weight_g, pack_grams, density_g_ml, allergens }
const R = [
  // Hortifrúti
  ['Alface crespa', 'produce', 'un', 'chilled', 1.3, { unit_weight_g: 250 }],
  ['Tomate', 'produce', 'kg', 'ambient', 1.25],
  ['Cebola', 'produce', 'kg', 'ambient', 1.03],
  ['Alho', 'produce', 'kg', 'ambient', 1.08],
  ['Batata inglesa', 'produce', 'kg', 'ambient', 1.06],
  ['Cenoura', 'produce', 'kg', 'chilled', 1.17],
  ['Abobrinha', 'produce', 'kg', 'chilled', 1.25],
  ['Chuchu', 'produce', 'kg', 'chilled', 1.47],
  ['Repolho', 'produce', 'kg', 'chilled', 1.72],
  ['Beterraba', 'produce', 'kg', 'chilled', 1.6],
  ['Pimentão verde', 'produce', 'kg', 'chilled', 1.26],
  ['Brócolis', 'produce', 'kg', 'chilled', 1.6],
  ['Abóbora cabotiá', 'produce', 'kg', 'ambient', 1.4],
  ['Mandioca', 'produce', 'kg', 'ambient', 1.3],
  ['Cheiro-verde', 'produce', 'un', 'chilled', 1.2, { unit_weight_g: 100 }],
  ['Banana prata', 'produce', 'kg', 'ambient', 1.5],
  ['Laranja pera', 'produce', 'kg', 'ambient', 1.4],
  ['Maçã', 'produce', 'kg', 'chilled', 1.15],
  ['Mamão formosa', 'produce', 'kg', 'ambient', 1.4],
  ['Limão taiti', 'produce', 'kg', 'ambient', 2],
  // Carnes, aves, peixes e ovos
  ['Carne bovina - patinho', 'meat', 'kg', 'chilled', 1.1],
  ['Carne bovina - acém', 'meat', 'kg', 'chilled', 1.15],
  ['Carne bovina moída', 'meat', 'kg', 'chilled', 1],
  ['Peito de frango', 'meat', 'kg', 'chilled', 1.12],
  ['Coxa e sobrecoxa de frango', 'meat', 'kg', 'chilled', 1.35],
  ['Lombo suíno', 'meat', 'kg', 'chilled', 1.1],
  ['Filé de tilápia', 'meat', 'kg', 'frozen', 1.05, { allergens: ['fish'] }],
  ['Ovo de galinha', 'meat', 'dz', 'ambient', 1.12, { unit_weight_g: 50, allergens: ['eggs'] }],
  // Laticínios
  ['Leite integral UHT', 'dairy', 'l', 'ambient', 1, { density_g_ml: 1.03, allergens: ['milk', 'lactose'] }],
  ['Queijo muçarela', 'dairy', 'kg', 'chilled', 1, { allergens: ['milk', 'lactose'] }],
  ['Manteiga com sal', 'dairy', 'kg', 'chilled', 1, { allergens: ['milk', 'lactose'] }],
  ['Iogurte natural', 'dairy', 'kg', 'chilled', 1, { allergens: ['milk', 'lactose'] }],
  ['Creme de leite', 'dairy', 'pct', 'ambient', 1, { pack_grams: 200, allergens: ['milk', 'lactose'] }],
  // Cereais, grãos e farinhas
  ['Arroz branco tipo 1', 'grains', 'kg', 'ambient', 1],
  ['Arroz integral', 'grains', 'kg', 'ambient', 1],
  ['Feijão carioca', 'grains', 'kg', 'ambient', 1.02],
  ['Feijão preto', 'grains', 'kg', 'ambient', 1.02],
  ['Macarrão espaguete', 'grains', 'kg', 'ambient', 1, { allergens: ['gluten'] }],
  ['Farinha de trigo', 'grains', 'kg', 'ambient', 1, { allergens: ['gluten'] }],
  ['Farinha de mandioca', 'grains', 'kg', 'ambient', 1],
  ['Fubá', 'grains', 'kg', 'ambient', 1],
  ['Aveia em flocos', 'grains', 'kg', 'ambient', 1, { allergens: ['gluten'] }],
  ['Lentilha', 'grains', 'kg', 'ambient', 1.02],
  // Panificação
  ['Pão francês', 'bakery', 'kg', 'ambient', 1, { allergens: ['gluten'] }],
  ['Pão de forma', 'bakery', 'pct', 'ambient', 1, { pack_grams: 500, allergens: ['gluten', 'soy'] }],
  // Mercearia
  ['Óleo de soja', 'grocery', 'l', 'ambient', 1, { density_g_ml: 0.92 }],
  ['Azeite de oliva extravirgem', 'grocery', 'l', 'ambient', 1, { density_g_ml: 0.92 }],
  ['Açúcar refinado', 'grocery', 'kg', 'ambient', 1],
  ['Sal refinado', 'grocery', 'kg', 'ambient', 1],
  ['Extrato de tomate', 'grocery', 'kg', 'ambient', 1],
  ['Vinagre de álcool', 'grocery', 'l', 'ambient', 1, { density_g_ml: 1.01 }],
  ['Café torrado e moído', 'grocery', 'kg', 'ambient', 1],
  ['Achocolatado em pó', 'grocery', 'kg', 'ambient', 1],
  ['Milho verde em conserva', 'grocery', 'kg', 'ambient', 1.4],
  // Bebidas
  ['Suco de laranja integral', 'beverages', 'l', 'chilled', 1, { density_g_ml: 1.04 }],
  ['Água mineral sem gás', 'beverages', 'l', 'ambient', 1, { density_g_ml: 1 }],
  // Congelados
  ['Polpa de fruta - maracujá', 'frozen', 'kg', 'frozen', 1],
  ['Ervilha congelada', 'frozen', 'kg', 'frozen', 1],
  // Limpeza e descartáveis
  ['Detergente neutro', 'cleaning', 'l', 'ambient', 1, { density_g_ml: 1 }],
  ['Solução clorada (hipoclorito de sódio 2,5%)', 'cleaning', 'l', 'ambient', 1, { density_g_ml: 1.03 }],
  ['Sanitizante para hortifrúti', 'cleaning', 'kg', 'ambient', 1],
  ['Luva descartável', 'disposables', 'cx', 'ambient', 1, { pack_grams: 500 }],
  ['Touca descartável', 'disposables', 'pct', 'ambient', 1, { pack_grams: 200 }],
];

export const STARTER_INGREDIENTS = R.map(([name, category, purchase_unit, storage, default_fc, extra = {}]) => ({
  name,
  category,
  purchase_unit,
  storage,
  default_fc,
  unit_weight_g: extra.unit_weight_g ?? null,
  pack_grams: extra.pack_grams ?? null,
  density_g_ml: extra.density_g_ml ?? null,
  allergens: extra.allergens ?? [],
}));

/** Chave de comparação de nomes: minúsculas, sem acento e sem espaços nas pontas. */
export const nameKey = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Itens do catálogo que ainda não existem na empresa (comparando pela chave do nome). */
export function missingStarter(existingNames) {
  const have = new Set(existingNames.map(nameKey));
  return STARTER_INGREDIENTS.filter((i) => !have.has(nameKey(i.name)));
}
