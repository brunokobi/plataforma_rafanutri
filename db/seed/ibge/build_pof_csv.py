"""Gera pof-2008-2009.csv a partir das planilhas oficiais do IBGE (POF 2008-2009).

Fontes (domínio público, citar o IBGE):
  https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/
    Tabelas_de_Composicao_Nutricional_dos_Alimentos_Consumidos_no_Brasil/tabelacompleta.zip
    Tabela_de_Medidas_Referidas_para_os_Alimentos_Consumidos_no_Brasil/tabelamedidas_bd.zip

Uso:
  python3 -m venv /tmp/venv && /tmp/venv/bin/pip install xlrd==2.0.1
  /tmp/venv/bin/python db/seed/ibge/build_pof_csv.py <pasta_com_os_xls> db/seed/taco/taco-4ed.csv db/seed/ibge/pof-2008-2009.csv

O IBGE grava os nomes em maiúsculas e sem acento: o gerador passa para minúsculas e devolve os acentos
com o vocabulário da TACO mais a lista ACCENTS abaixo. Os grupos seguem os 15 grupos da TACO, para a
navegação por grupo valer para as duas fontes. Itens "orgânicos" ficam de fora (mesmos valores do
alimento comum). Medidas em grama, quilo, mililitro e litro ficam de fora (o editor já aceita gramas).
"""
import csv
import json
import re
import sys
import unicodedata

import xlrd

# Palavras que a TACO não traz e precisam de acento (ortografia atual).
ACCENTS = {
    'abara': 'abará', 'acaja': 'acajá', 'acu': 'açu', 'adocante': 'adoçante', 'alcool': 'álcool', 'alcoolica': 'alcoólica',
    'algodao': 'algodão', 'almondega': 'almôndega', 'araca': 'araçá', 'avela': 'avelã', 'bau': 'baú', 'bobo': 'bobó',
    'bufala': 'búfala', 'bufalo': 'búfalo', 'butia': 'butiá', 'cacarola': 'caçarola', 'cachaca': 'cachaça', 'cajuina': 'cajuína',
    'carcaca': 'carcaça', 'carre': 'carré', 'chimarrao': 'chimarrão', 'chines': 'chinês', 'chourico': 'chouriço',
    'colonia': 'colônia', 'contrafile': 'contrafilé', 'empadao': 'empadão', 'energetica': 'energética', 'especie': 'espécie',
    'hortela': 'hortelã', 'inga': 'ingá', 'jacare': 'jacaré', 'jamburao': 'jamburão', 'liquido': 'líquido', 'maco': 'maço',
    'mao': 'mão', 'manha': 'manhã', 'medio': 'médio', 'mucaja': 'mucajá', 'mungunza': 'mungunzá', 'oregano': 'orégano',
    'pa': 'pá', 'pacoquinha': 'paçoquinha', 'pascoa': 'páscoa', 'pasteis': 'pastéis', 'pataua': 'patauá', 'pate': 'patê',
    'pave': 'pavê', 'pedaco': 'pedaço', 'pedacos': 'pedaços', 'picole': 'picolé', 'pirao': 'pirão', 'porcao': 'porção',
    'proteina': 'proteína', 'role': 'rolê', 'sache': 'sachê', 'salsao': 'salsão', 'sanduiche': 'sanduíche', 'sertao': 'sertão',
    'sufle': 'suflê', 'suina': 'suína', 'suino': 'suíno', 'suinas': 'suínas', 'suinos': 'suínos', 'taca': 'taça', 'terere': 'tereré',
    'torrao': 'torrão', 'tracaja': 'tracajá', 'tubaina': 'tubaína', 'uacai': 'uaçaí', 'uisque': 'uísque', 'viscera': 'víscera',
    'visceras': 'vísceras', 'xerem': 'xerém', 'xicara': 'xícara', 'moca': 'moça', 'india': 'índia', 'pe': 'pé',
    # ortografia atual no lugar da grafia antiga da TACO
    'pera': 'pera', 'geleia': 'geleia', 'linguica': 'linguiça', 'atemoia': 'atemoia', 'para': 'para', 'baia': 'baía',
    'lacteo': 'lácteo', 'lacteos': 'lácteos', 'lactea': 'láctea', 'graos': 'grãos', 'paes': 'pães', 'acucares': 'açúcares',
    'feijoes': 'feijões', 'macarroes': 'macarrões', 'sucos': 'sucos', 'calorico': 'calórico', 'organico': 'orgânico',
}
PHRASES = [(r'\bdo para\b', 'do Pará'), (r'\bda bahia\b', 'da Bahia'), (r'\bde minas\b', 'de Minas'), (r'\bda índia\b', 'da Índia'),
           (r'\bde angola\b', 'de Angola'), (r'\bdo paraguai\b', 'do Paraguai'), (r'\b\(bahia\)', '(Bahia)'), (r'\bdo sul\b', 'do Sul'),
           (r'\bpaulista\b', 'paulista'), (r'\bcapixaba\b', 'capixaba')]

PREPARATIONS = {
    'NAO SE APLICA': None, '': None,
    'CRU(A)': 'cru(a)', 'COZIDO(A)': 'cozido(a)', 'FRITO(A)': 'frito(a)', 'ASSADO(A)': 'assado(a)', 'REFOGADO(A)': 'refogado(a)',
    'ENSOPADO': 'ensopado', 'GRELHADO(A)/BRASA/CHURRASCO': 'grelhado(a) ou na brasa', 'MOLHO VERMELHO': 'ao molho vermelho',
    'EMPANADO(A)/A MILANESA': 'empanado(a) ou à milanesa', 'SOPA': 'em sopa', 'AO VINAGRETE': 'ao vinagrete',
    'MOLHO BRANCO': 'ao molho branco', 'AO ALHO E OLEO': 'ao alho e óleo', 'COM MANTEIGA/OLEO': 'com manteiga ou óleo',
    'MINGAU': 'em mingau',
}

# Colunas da planilha -> códigos de nutrients (0001 e 0061). Fora daqui: equivalente de niacina, 18:2 e 18:3.
NUTRIENT_COLUMNS = {
    'ENERGIA (kcal)': 'energy_kcal', 'PROTEÍNA (g)': 'protein_g', 'LIPÍDEOS TOTAIS (g)': 'lipid_g', 'CARBOIDRATO (g)': 'carbohydrate_g',
    'FIBRA ALIMENTAR TOTAL (g)': 'fiber_g', 'CÁLCIO (mg)': 'calcium_mg', 'MAGNÉSIO (mg)': 'magnesium_mg', 'MANGANÊS (mg)': 'manganese_mg',
    'FÓSFORO (mg)': 'phosphorus_mg', 'FERRO (mg)': 'iron_mg', 'SÓDIO (mg)': 'sodium_mg', 'SÓDIO DE ADIÇÃO (mg)': 'added_sodium_mg',
    'POTÁSSIO (mg)': 'potassium_mg', 'COBRE (mg)': 'copper_mg', 'ZINCO (mg)': 'zinc_mg', 'SELÊNIO (mcg)': 'selenium_mcg',
    'RETINOL (mcg)': 'retinol_mcg', 'VITAMINA A (EQUIVALENTE DE ATIVIDADE DE RETINOL) (mcg)': 'vitamin_a_rae_mcg',
    'TIAMINA (VITAMINA B1) (mg)': 'thiamin_mg', 'RIBOFLAVINA (VITAMINA B2) (mg)': 'riboflavin_mg', 'NIACINA (VITAMINA B3) (mg)': 'niacin_mg',
    'PIRIDOXINA (VITAMINA B6) (mg)': 'pyridoxine_mg', 'COBALAMINA (VITAMINA B12) (mcg)': 'vitamin_b12_mcg',
    'FOLATO (EQUIVALENTE DIETÉTICO DE FOLATO) (mcg)': 'folate_mcg', 'VITAMINA D (CALCIFEROL) (mcg)': 'vitamin_d_mcg',
    'VITAMINA E (TOTAL DE ALPHA-TOCOPHEROL) (mg)': 'vitamin_e_mg', 'VITAMINA C (mg)': 'vitamin_c_mg', 'COLESTEROL (mg)': 'cholesterol_mg',
    'ÁCIDOS GRAXOS SATURADOS (g)': 'saturated_fat_g', 'ÁCIDOS GRAXOS MONOINSATURADOS (g)': 'monounsaturated_fat_g',
    'ÁCIDOS GRAXOS POLIINSATURADOS (g)': 'polyunsaturated_fat_g', 'ÁCIDOS GRAXOS TRANS TOTAL (g)': 'trans_fat_g',
    'AÇÚCAR TOTAL (g)': 'sugar_total_g', 'AÇÚCAR DE ADIÇÃO (g)': 'sugar_added_g',
}
NUTRIENTS = list(dict.fromkeys(NUTRIENT_COLUMNS.values())) + ['energy_kj']

SKIP_MEASURES = {'GRAMA', 'QUILO', 'MILILITRO', 'LITRO'}

LEGUMES = re.compile(r'FEIJAO|ERVILHA|LENTILHA|GRAO DE BICO|SOJA|ANDU|FAVA|AMENDOIM|MANGALO|TOFU')
FRUITS_660 = {'ACAI', 'BACABA', 'BACABUCU', 'BURITI', 'BUTIA', 'JUCARA', 'JUSSARA', 'PATAUA', 'PUPUNHA', 'TUCUMA', 'UACAI', 'COCO MUCAJA'}


def group_of(code: int, name: str) -> str:
    p = str(code)[:3]
    n = name.strip()
    if p == '630':
        return 'Leguminosas e derivados' if LEGUMES.search(n) else ('Nozes e sementes' if 'LINHACA' in n else 'Cereais e derivados')
    if p == '650':
        return 'Leguminosas e derivados' if LEGUMES.search(n) or 'VEGETAL' in n else 'Cereais e derivados'
    if p == '660':
        return 'Frutas e derivados' if n in FRUITS_660 else 'Nozes e sementes'
    if p in ('640', '670'):
        return 'Verduras, hortaliças e derivados'
    if p in ('680', '681'):
        return 'Frutas e derivados'
    if p in ('690', '691'):
        return 'Produtos açucarados'
    if p in ('700', '701', '707'):
        return 'Leguminosas e derivados' if 'SOJA' in n else ('Nozes e sementes' if 'GERGELIM' in n else 'Miscelâneas')
    if p in ('710', '711', '744', '810'):
        return 'Carnes e derivados'
    if p in ('720', '726', '727', '740', '760'):
        return 'Pescados e frutos do mar'
    if p == '770':
        return 'Outros alimentos industrializados'
    if p == '780':
        return 'Ovos e derivados' if n.startswith('OVO') else 'Carnes e derivados'
    if p == '790':
        if 'SOJA' in n or n == 'TOFU':
            return 'Leguminosas e derivados'
        if n.startswith(('MANTEIGA', 'MARGARINA')):
            return 'Gorduras e óleos'
        return 'Leite e derivados'
    if p in ('800', '801'):
        return 'Cereais e derivados'
    if p in ('820', '821', '827', '830'):
        return 'Bebidas (alcoólicas e não alcoólicas)'
    if p == '840':
        return 'Gorduras e óleos'
    return 'Alimentos preparados'


def unaccent(s: str) -> str:
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()


def load_accents(taco_csv: str) -> dict:
    amap = {}
    with open(taco_csv, encoding='utf8') as f:
        for r in csv.DictReader(f):
            for w in re.findall(r'[^\W\d_]+', (r['name'] + ' ' + r['food_group']).lower()):
                if unaccent(w) != w:
                    amap[unaccent(w)] = w
    amap.update(ACCENTS)
    return amap


def pretty(text: str, amap: dict) -> str:
    s = re.sub(r'\s+', ' ', text.strip()).lower()
    s = re.sub(r'[^\W\d_]+', lambda m: amap.get(m.group(0), m.group(0)), s)
    s = s.replace('etc)', 'etc.)').replace('n. e.', '').replace('( )', '').replace('()', '')
    for pat, rep in PHRASES:
        s = re.sub(pat, rep, s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:1].upper() + s[1:]


def number(v):
    if isinstance(v, float):
        return round(v, 4)
    return None  # '-' = não disponível


def main(src: str, taco_csv: str, out: str) -> None:
    amap = load_accents(taco_csv)
    comp = xlrd.open_workbook(f'{src}/tabelacompleta.xls').sheet_by_index(0)
    header = [str(h).strip() for h in comp.row_values(3)]
    col = {h: i for i, h in enumerate(header)}
    missing = [h for h in NUTRIENT_COLUMNS if h not in col]
    if missing:
        raise SystemExit(f'colunas não encontradas: {missing}')

    meas = xlrd.open_workbook(f'{src}/tabelamedidas_bd.xls').sheet_by_index(0)
    measures: dict = {}
    for r in range(meas.nrows):
        row = meas.row_values(r)
        if not isinstance(row[0], float) or row[5].strip() in SKIP_MEASURES or not isinstance(row[8], float) or row[8] <= 0:
            continue
        key = (int(row[0]), int(row[2]))
        label = pretty(row[5], amap).lower()
        lst = measures.setdefault(key, [])
        if label and all(m['label'] != label for m in lst):
            lst.append({'label': label, 'grams': round(row[8], 1)})

    out_rows = []
    names: dict = {}
    for r in range(4, comp.nrows):
        row = comp.row_values(r)
        if not isinstance(row[0], float):
            continue
        food, prep = int(row[0]), int(row[2]) if isinstance(row[2], float) else 99
        desc = row[1]
        if 'ORGANIC' in unaccent(desc).upper():
            continue
        prep_label = PREPARATIONS[row[3].strip()]
        name = pretty(desc, amap) + (f', {prep_label}' if prep_label else '')
        values = {NUTRIENT_COLUMNS[h]: number(row[col[h]]) for h in NUTRIENT_COLUMNS}
        kcal = values['energy_kcal']
        values['energy_kj'] = round(kcal * 4.184, 1) if kcal is not None else None
        out_rows.append({
            'source_code': f'{food}-{prep}',
            'name': name,
            'food_group': group_of(food, desc),
            'household_measures': json.dumps(sorted(measures.get((food, prep), []), key=lambda m: m['grams'])[:12], ensure_ascii=False),
            **values,
        })
        names.setdefault(name.lower(), []).append(out_rows[-1])

    # Nomes repetidos (o IBGE separa por código, ex.: dois "Alcatra"): acrescenta o código para distinguir.
    for same in names.values():
        if len(same) > 1:
            for item in same:
                item['name'] = f"{item['name']} (cód. {item['source_code']})"

    with open(out, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['source_code', 'name', 'food_group', 'household_measures', *NUTRIENTS])
        w.writeheader()
        for item in sorted(out_rows, key=lambda x: x['source_code']):
            w.writerow({k: ('' if v is None else v) for k, v in item.items()})
    print(f'{len(out_rows)} alimentos, {sum(1 for x in out_rows if x["household_measures"] != "[]")} com medidas caseiras')


if __name__ == '__main__':
    main(*sys.argv[1:4])
