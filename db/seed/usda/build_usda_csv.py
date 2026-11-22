"""Gera usda-sr-legacy.csv: USDA FoodData Central SR Legacy (abril de 2018) com nomes em português.

Fonte: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip — domínio público (CC0 1.0);
o USDA pede citar "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central".

Ficam de fora: alimentos infantis industrializados, fast-food, restaurantes, alimentos indígenas norte-americanos e itens de marca
(nome com palavra em maiúsculas). Os nomes vêm de usda-names-pt.json (tradução por IA, revisável); grupos mapeados para os 15 da TACO;
medidas caseiras do USDA traduzidas (xícara, colher, fatia, unidade…; onças, libras, latas e pacotes ficam de fora).

Uso: python3 db/seed/usda/build_usda_csv.py <pasta_do_zip_extraído> db/seed/usda/usda-names-pt.json db/seed/usda/usda-sr-legacy.csv
"""
import csv
import json
import re
import sys

SKIP = {'Baby Foods', 'Fast Foods', 'American Indian/Alaska Native Foods', 'Restaurant Foods'}
GROUPS = {
    'Beef Products': 'Carnes e derivados', 'Lamb, Veal, and Game Products': 'Carnes e derivados', 'Pork Products': 'Carnes e derivados',
    'Sausages and Luncheon Meats': 'Carnes e derivados', 'Poultry Products': 'Carnes e derivados', 'Vegetables and Vegetable Products': 'Verduras, hortaliças e derivados',
    'Baked Products': 'Cereais e derivados', 'Breakfast Cereals': 'Cereais e derivados', 'Cereal Grains and Pasta': 'Cereais e derivados',
    'Beverages': 'Bebidas (alcoólicas e não alcoólicas)', 'Sweets': 'Produtos açucarados', 'Fruits and Fruit Juices': 'Frutas e derivados',
    'Dairy and Egg Products': 'Leite e derivados', 'Legumes and Legume Products': 'Leguminosas e derivados', 'Finfish and Shellfish Products': 'Pescados e frutos do mar',
    'Soups, Sauces, and Gravies': 'Alimentos preparados', 'Fats and Oils': 'Gorduras e óleos', 'Snacks': 'Outros alimentos industrializados',
    'Nut and Seed Products': 'Nozes e sementes', 'Meals, Entrees, and Side Dishes': 'Alimentos preparados', 'Spices and Herbs': 'Miscelâneas',
}
# id do nutriente no FoodData Central -> código em nutrients
NUTRIENTS = {
    '1008': 'energy_kcal', '1062': 'energy_kj', '1003': 'protein_g', '1005': 'carbohydrate_g', '1004': 'lipid_g', '1258': 'saturated_fat_g',
    '1292': 'monounsaturated_fat_g', '1293': 'polyunsaturated_fat_g', '1257': 'trans_fat_g', '1253': 'cholesterol_mg', '1079': 'fiber_g',
    '2000': 'sugar_total_g', '1051': 'moisture_pct', '1007': 'ash_g', '1087': 'calcium_mg', '1090': 'magnesium_mg', '1101': 'manganese_mg',
    '1091': 'phosphorus_mg', '1089': 'iron_mg', '1093': 'sodium_mg', '1092': 'potassium_mg', '1098': 'copper_mg', '1095': 'zinc_mg',
    '1103': 'selenium_mcg', '1105': 'retinol_mcg', '1106': 'vitamin_a_rae_mcg', '1165': 'thiamin_mg', '1166': 'riboflavin_mg',
    '1175': 'pyridoxine_mg', '1167': 'niacin_mg', '1178': 'vitamin_b12_mcg', '1190': 'folate_mcg', '1114': 'vitamin_d_mcg',
    '1109': 'vitamin_e_mg', '1162': 'vitamin_c_mg',
}
ALL_COLUMNS = ['energy_kcal', 'energy_kj', 'protein_g', 'carbohydrate_g', 'lipid_g', 'saturated_fat_g', 'monounsaturated_fat_g',
               'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'fiber_g', 'sugar_total_g', 'sugar_added_g', 'moisture_pct', 'ash_g',
               'calcium_mg', 'magnesium_mg', 'manganese_mg', 'phosphorus_mg', 'iron_mg', 'sodium_mg', 'added_sodium_mg', 'potassium_mg',
               'copper_mg', 'zinc_mg', 'selenium_mcg', 'retinol_mcg', 'vitamin_a_re_mcg', 'vitamin_a_rae_mcg', 'thiamin_mg', 'riboflavin_mg',
               'pyridoxine_mg', 'niacin_mg', 'vitamin_b12_mcg', 'folate_mcg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_c_mg']
UNITS = {
    'cup': 'xícara', 'cups': 'xícara', 'tbsp': 'colher de sopa', 'tablespoon': 'colher de sopa', 'tsp': 'colher de chá', 'teaspoon': 'colher de chá',
    'piece': 'pedaço', 'pieces': 'pedaço', 'slice': 'fatia', 'slices': 'fatia', 'serving': 'porção', 'portion': 'porção', 'medium': 'unidade média',
    'large': 'unidade grande', 'small': 'unidade pequena', 'extra large': 'unidade extra grande', 'fillet': 'filé', 'steak': 'bife',
    'breast': 'peito', 'drumstick': 'coxa', 'thigh': 'sobrecoxa', 'wing': 'asa', 'leaf': 'folha', 'cookie': 'unidade', 'cracker': 'unidade',
    'bar': 'barra', 'patty': 'unidade', 'chop': 'bisteca', 'item': 'unidade', 'unit': 'unidade', 'scoop': 'concha', 'head': 'cabeça',
    'stalk': 'talo', 'clove': 'dente', 'egg': 'unidade', 'fruit': 'unidade', 'bagel': 'unidade', 'muffin': 'unidade', 'roll': 'unidade',
}
# palavras em maiúsculas que não são marca
NOT_BRAND = {'USDA', 'USA', 'DHA', 'ARA', 'NFS', 'UHT', 'II'}


def is_branded(desc):
    """Itens de marca: palavra toda em maiúsculas (QUAKER, NESTLE…) ou nome começando com possessivo (Udi's, …)."""
    if any(w not in NOT_BRAND for w in re.findall(r'\b[A-Z]{3,}\b', desc)):
        return True
    return bool(re.match(r"^[A-Z][\w-]*'s,", desc) or BRANDS.search(desc))


BRANDS = re.compile(r'\b(Pillsbury|Kraft|George Weston|Ready Crust|Pepperidge Farm|Interstate Brands|La Ricura|Sage Valley|Lean Pockets|'
                    r'Reddi Wip|Oscar Mayer|Archway|Continental Mills|Krusteaz|Mckee|Little Debbie|Hormel|Martha White|Mission Foods)\b')


FRACTIONS = {0.25: '1/4', 0.33: '1/3', 0.333: '1/3', 0.5: '1/2', 0.67: '2/3', 0.667: '2/3', 0.75: '3/4'}


def portion_label(amount, modifier):
    mod = modifier.strip().lower()
    unit = None
    for key in sorted(UNITS, key=len, reverse=True):
        if mod == key or mod.startswith(f'{key} ') or mod.startswith(f'{key},') or mod.startswith(f'{key} ('):
            unit = UNITS[key]
            break
    if not unit:
        return None
    try:
        a = float(amount or 1)
    except ValueError:
        a = 1
    if abs(a - 1) < 1e-9:
        return unit
    frac = FRACTIONS.get(round(a, 3)) or FRACTIONS.get(round(a, 2))
    qty = frac or (f'{a:g}'.replace('.', ','))
    return f'{qty} {unit}'


def main(src, names_path, out):
    names = json.load(open(names_path, encoding='utf8'))
    cats = {r['id']: r['description'] for r in csv.DictReader(open(f'{src}/food_category.csv', encoding='utf8'))}
    foods = {}
    for r in csv.DictReader(open(f'{src}/food.csv', encoding='utf8')):
        cat = cats.get(r['food_category_id'])
        if cat in SKIP or r['fdc_id'] not in names or is_branded(r['description']):
            continue
        group = GROUPS.get(cat, 'Outros alimentos industrializados')
        if cat == 'Dairy and Egg Products' and r['description'].lower().startswith('egg'):
            group = 'Ovos e derivados'
        name = re.sub(r'\s+', ' ', names[r['fdc_id']]).strip()
        foods[r['fdc_id']] = {'source_code': r['fdc_id'], 'name': name[:1].upper() + name[1:], 'food_group': group, 'measures': []}
    values = {fid: {} for fid in foods}
    for r in csv.DictReader(open(f'{src}/food_nutrient.csv', encoding='utf8')):
        code = NUTRIENTS.get(r['nutrient_id'])
        if code and r['fdc_id'] in values and r['amount'] != '':
            values[r['fdc_id']][code] = round(float(r['amount']), 4)
    for r in csv.DictReader(open(f'{src}/food_portion.csv', encoding='utf8')):
        f = foods.get(r['fdc_id'])
        if not f:
            continue
        label = portion_label(r['amount'], r['modifier'] or r['portion_description'])
        try:
            grams = round(float(r['gram_weight']), 1)
        except ValueError:
            continue
        if label and 0 < grams <= 2000 and all(m['label'] != label for m in f['measures']):
            f['measures'].append({'label': label, 'grams': grams})
    rows = 0
    with open(out, 'w', newline='', encoding='utf8') as fh:
        w = csv.writer(fh, lineterminator='\n')
        w.writerow(['source_code', 'name', 'food_group', 'household_measures', *ALL_COLUMNS])
        for fid in sorted(foods, key=int):
            f, v = foods[fid], values[fid]
            if 'energy_kcal' not in v:
                continue
            measures = sorted(f['measures'], key=lambda m: m['grams'])[:6]
            w.writerow([f['source_code'], f['name'], f['food_group'], json.dumps(measures, ensure_ascii=False), *[('' if v.get(c) is None else v[c]) for c in ALL_COLUMNS]])
            rows += 1
    print(f'{rows} alimentos do USDA')


if __name__ == '__main__':
    main(*sys.argv[1:4])
