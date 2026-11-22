"""Gera off-brasil.csv: produtos vendidos no Brasil do Open Food Facts, com tabela nutricional conferida.

Fonte: Open Food Facts (https://world.openfoodfacts.org), API v2 /search?countries_tags_en=brazil.
Licença: Open Database License (ODbL) para a base; conteúdo de cada produto sob Database Contents License.
Exige citar "Open Food Facts" e manter aberta (ODbL) a base derivada — este CSV fica no repositório para isso.

Baixar: cd <pasta> && python3 <repo>/db/seed/off/fetch_off.py — usa search.openfoodfacts.org (até 10 mil resultados por busca), dividindo os
produtos do Brasil pelo prefixo do código de barras (7890* a 7899* e o resto) para pegar todos.
Gerar: python3 db/seed/off/build_off_csv.py <pasta> db/seed/off/off-brasil.csv [<pasta_detalhes>]
(detalhes: um JSON por código de barras de /api/v2/product/<código>, com categorias e porção; ver enrich_off.py)

Filtros: nome, energia e os três macronutrientes presentes; energia de 0 a 900 kcal/100 g; proteína + carboidrato + gordura até 100 g;
energia coerente com os macronutrientes (4/4/9 kcal por g, tolerância de 25% ou 15 kcal); kJ coerente com kcal quando os dois existem;
um item por nome (o com mais nutrientes). Valores do rótulo por 100 g (bebidas: por 100 ml, tratados como 100 g).
"""
import csv
import glob
import json
import re
import sys
import unicodedata

GROUPS = [
    (('en:fats', 'en:vegetable-oils', 'en:margarines', 'en:butters', 'en:olive-oils'), 'Gorduras e óleos'),
    (('en:dairies', 'en:milks', 'en:yogurts', 'en:cheeses', 'en:fermented-milk-products', 'en:dairy-desserts'), 'Leite e derivados'),
    (('en:eggs',), 'Ovos e derivados'),
    (('en:seafood', 'en:fishes', 'en:canned-fishes', 'en:fish-and-meat-and-eggs:fishes'), 'Pescados e frutos do mar'),
    (('en:meats', 'en:prepared-meats', 'en:sausages', 'en:hams', 'en:poultries', 'en:meat-based-products'), 'Carnes e derivados'),
    (('en:nuts', 'en:seeds', 'en:nuts-and-their-products'), 'Nozes e sementes'),
    (('en:legumes', 'en:beans', 'en:pulses', 'en:legumes-and-their-products'), 'Leguminosas e derivados'),
    (('en:chocolates', 'en:candies', 'en:confectioneries', 'en:sweets', 'en:sugars', 'en:sweet-spreads', 'en:jams', 'en:desserts', 'en:ice-creams-and-sorbets', 'en:sweet-snacks'), 'Produtos açucarados'),
    (('en:breads', 'en:biscuits', 'en:biscuits-and-cakes', 'en:breakfast-cereals', 'en:pastas', 'en:flours', 'en:cereals-and-their-products', 'en:cereals-and-potatoes', 'en:rices', 'en:cakes'), 'Cereais e derivados'),
    (('en:beverages', 'en:waters', 'en:juices', 'en:sodas', 'en:alcoholic-beverages', 'en:coffees', 'en:teas'), 'Bebidas (alcoólicas e não alcoólicas)'),
    (('en:fruits', 'en:fruit-based-foods', 'en:fruits-based-foods'), 'Frutas e derivados'),
    (('en:vegetables', 'en:vegetable-based-foods', 'en:plant-based-foods-and-beverages:vegetables'), 'Verduras, hortaliças e derivados'),
    (('en:sauces', 'en:condiments', 'en:spices', 'en:salts', 'en:groceries'), 'Miscelâneas'),
    (('en:meals', 'en:prepared-foods', 'en:frozen-foods', 'en:pizzas', 'en:sandwiches', 'en:soups'), 'Alimentos preparados'),
]

# nutriente do OFF (por 100 g) -> (código em nutrients, fator para a unidade de lá)
NUTRIENTS = {
    'energy-kcal_100g': ('energy_kcal', 1), 'proteins_100g': ('protein_g', 1), 'carbohydrates_100g': ('carbohydrate_g', 1),
    'fat_100g': ('lipid_g', 1), 'fiber_100g': ('fiber_g', 1), 'sodium_100g': ('sodium_mg', 1000), 'saturated-fat_100g': ('saturated_fat_g', 1),
    'monounsaturated-fat_100g': ('monounsaturated_fat_g', 1), 'polyunsaturated-fat_100g': ('polyunsaturated_fat_g', 1),
    'trans-fat_100g': ('trans_fat_g', 1), 'cholesterol_100g': ('cholesterol_mg', 1000), 'sugars_100g': ('sugar_total_g', 1),
    'added-sugars_100g': ('sugar_added_g', 1), 'calcium_100g': ('calcium_mg', 1000), 'iron_100g': ('iron_mg', 1000),
    'potassium_100g': ('potassium_mg', 1000), 'vitamin-c_100g': ('vitamin_c_mg', 1000),
}
# Ordem fixa de colunas, igual em todas as bases importadas por db/seed/import_foods.sql.
ALL_COLUMNS = ['energy_kcal', 'energy_kj', 'protein_g', 'carbohydrate_g', 'lipid_g', 'saturated_fat_g', 'monounsaturated_fat_g',
               'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'fiber_g', 'sugar_total_g', 'sugar_added_g', 'moisture_pct', 'ash_g',
               'calcium_mg', 'magnesium_mg', 'manganese_mg', 'phosphorus_mg', 'iron_mg', 'sodium_mg', 'added_sodium_mg', 'potassium_mg',
               'copper_mg', 'zinc_mg', 'selenium_mcg', 'retinol_mcg', 'vitamin_a_re_mcg', 'vitamin_a_rae_mcg', 'thiamin_mg', 'riboflavin_mg',
               'pyridoxine_mg', 'niacin_mg', 'vitamin_b12_mcg', 'folate_mcg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_c_mg']
COLUMNS = ALL_COLUMNS


def num(v):
    try:
        f = float(v)
        return f if f == f and f >= 0 else None
    except (TypeError, ValueError):
        return None


def text(v):
    """A API de busca devolve alguns campos como lista ou por idioma (dict); a v2, como texto."""
    if isinstance(v, dict):
        v = v.get('pt') or v.get('main') or next(iter(v.values()), '')
    if isinstance(v, list):
        v = ', '.join(str(x) for x in v)
    return str(v or '')


def clean_name(p):
    name = (text(p.get('product_name_pt')) or text(p.get('product_name'))).strip()
    name = re.sub(r'\s+', ' ', name)
    if len(name) < 3 or not re.search(r'[A-Za-zÀ-ú]{3}', name):
        return None
    if name.isupper():
        name = name.capitalize()
    brand = text(p.get('brands')).split(',')[0].strip()
    if brand and brand.lower() not in name.lower():
        name = f'{name} — {brand.title() if brand.isupper() else brand}'
    return name[:110]


# Sem categoria no Open Food Facts: o grupo sai do nome (primeira regra que casa).
NAME_GROUPS = [
    (r'\b(azeite|oleo|margarina|manteiga|banha|gordura vegetal)\b', 'Gorduras e óleos'),
    (r'\b(leite|iogurte|queijo|requeijao|coalhada|kefir|nata|creme de leite|bebida lactea|whey)\b', 'Leite e derivados'),
    (r'\b(ovo|ovos)\b', 'Ovos e derivados'),
    (r'\b(atum|sardinha|salmao|bacalhau|peixe|camarao|merluza|tilapia)\b', 'Pescados e frutos do mar'),
    (r'\b(carne|frango|peru|presunto|salsicha|linguica|mortadela|salame|bacon|hamburguer|charque|peito de)\b', 'Carnes e derivados'),
    (r'\b(feijao|lentilha|grao de bico|ervilha|soja|tofu)\b', 'Leguminosas e derivados'),
    (r'\b(castanha|amendoim|amendoa|noz|nozes|chia|linhaca|gergelim|semente|pasta de amendoim)\b', 'Nozes e sementes'),
    (r'\b(chocolate|bombom|bala|doce|geleia|achocolatado|sorvete|acucar|mel|goiabada|pacoca|wafer|recheado)\b', 'Produtos açucarados'),
    (r'\b(arroz|aveia|granola|cereal|farinha|fuba|macarrao|massa|pao|biscoito|bolacha|torrada|tapioca|cuscuz|quinoa|milho|bolo)\b', 'Cereais e derivados'),
    (r'\b(suco|refrigerante|cha|cafe|agua|cerveja|vinho|energetico|isotonico|nectar|bebida)\b', 'Bebidas (alcoólicas e não alcoólicas)'),
    (r'\b(molho|ketchup|maionese|mostarda|tempero|sal|caldo|vinagre)\b', 'Miscelâneas'),
    (r'\b(pizza|lasanha|sanduiche|sopa|refeicao|empanado|nuggets|pao de queijo)\b', 'Alimentos preparados'),
]


def group_of(tags, name=''):
    tags = set(tags or [])
    for keys, group in GROUPS:
        if tags.intersection(keys):
            return group
    n = norm(name)
    for pattern, group in NAME_GROUPS:
        if re.search(pattern, n):
            return group
    return 'Outros alimentos industrializados'


def norm(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip()


def main(src, out, detail_dir=None):
    best = {}
    seen_codes = set()
    total = 0
    for path in sorted(glob.glob(f'{src}/*.json')):
        if path.endswith('codes.json'):
            continue
        for p in json.load(open(path)).get('products', []):
            total += 1
            code = str(p.get('code') or '').strip()
            if not re.fullmatch(r'\d{8,14}', code) or code in seen_codes:
                continue
            seen_codes.add(code)
            if detail_dir:
                try:
                    full = json.load(open(f'{detail_dir}/{code}.json'))
                    p = {**p, **{k: v for k, v in full.items() if v not in (None, '', [], {})}}
                except (OSError, ValueError):
                    pass
            name = clean_name(p)
            n = p.get('nutriments') or {}
            if not name:
                continue
            kcal = num(n.get('energy-kcal_100g'))
            kj = num(n.get('energy-kj_100g')) or num(n.get('energy_100g'))
            if kcal is None and kj is not None:
                kcal = kj / 4.184
            prot, carb, fat = num(n.get('proteins_100g')), num(n.get('carbohydrates_100g')), num(n.get('fat_100g'))
            if None in (kcal, prot, carb, fat) or kcal > 900 or prot + carb + fat > 102:
                continue
            est = 4 * prot + 4 * carb + 9 * fat
            if abs(est - kcal) > max(15, 0.25 * kcal):
                continue
            if kj is not None and num(n.get('energy-kcal_100g')) is not None and abs(kj / 4.184 - kcal) > max(10, 0.15 * kcal):
                continue
            values = {}
            for key, (col, factor) in NUTRIENTS.items():
                v = num(n.get(key))
                values[col] = round(v * factor, 4) if v is not None else None
            values['energy_kcal'] = round(kcal, 1)
            values['energy_kj'] = round(kcal * 4.184, 1)
            if (values.get('fiber_g') or 0) > 100 or (values.get('sodium_mg') or 0) > 40000:
                continue
            serving = num(p.get('serving_quantity'))
            measures = [{'label': 'porção do rótulo', 'grams': round(serving, 1)}] if serving and 1 <= serving <= 1000 else []
            row = {'source_code': code, 'name': name, 'food_group': group_of(p.get('categories_tags'), name), 'household_measures': json.dumps(measures, ensure_ascii=False), **values}
            key = norm(name)
            filled = sum(v is not None for v in values.values())
            if key not in best or filled > best[key][0]:
                best[key] = (filled, row)
    rows = sorted((r for _, r in best.values()), key=lambda r: r['source_code'])
    with open(out, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['source_code', 'name', 'food_group', 'household_measures', *COLUMNS], lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({k: ('' if r.get(k) is None else r[k]) for k in ['source_code', 'name', 'food_group', 'household_measures', *COLUMNS]})
    print(f'{total} produtos lidos, {len(rows)} aproveitados')


if __name__ == '__main__':
    main(*sys.argv[1:4])
