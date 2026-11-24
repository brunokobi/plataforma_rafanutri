"""Gera library.sql: a biblioteca de modelos de plano da plataforma (meal_plan_templates sem consultório).

Cada padrão alimentar é descrito numa refeição-base de cerca de 2.000 kcal com alimentos da TACO e do IBGE.
Para cada faixa de energia o gerador acha um fator k que leva o dia à meta, escalando cada item pela sua classe
(verduras fixas; frutas, laticínios e proteínas pouco; cereais, tubérculos e gorduras proporcionalmente),
arredonda as quantidades e calcula substituições com a mesma energia. Os valores vêm dos CSVs da TACO e do IBGE.

Base técnica (texto próprio, sem reproduzir as publicações): Guia Alimentar para a População Brasileira (MS, 2014)
e os Protocolos de uso do Guia (MS, 2021-2022), padrão DASH (NHLBI/NIH), padrões alimentares do USDA (domínio público).
Todos os modelos saem marcados "modelo base — revisar antes de prescrever" e dependem da validação da RT.

Uso: python3 db/seed/plan-library/build_library.py   (grava db/seed/plan-library/library.sql e imprime o relatório)
"""
import csv
import json
import math
import os
import uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, '..', '..', '..'))
NS = uuid.UUID('6f1b5b0e-3d0a-4a43-9f39-2b7f0c6a9d11')  # ids estáveis: rodar de novo atualiza, não duplica
NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g', 'fiber_g', 'sodium_mg']


def load():
    data = {}
    with open(os.path.join(REPO, 'db/seed/taco/taco-4ed.csv'), encoding='utf8') as f:
        for r in csv.DictReader(f):
            data[f"TACO:{r['taco_code']}"] = (r['name'], {k: num(r.get(k)) for k in NUTRIENTS})
    with open(os.path.join(REPO, 'db/seed/ibge/pof-2008-2009.csv'), encoding='utf8') as f:
        for r in csv.DictReader(f):
            data[f"IBGE:{r['source_code']}"] = (r['name'], {k: num(r.get(k)) for k in NUTRIENTS})
    return data


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0 if v == 'Tr' else None


FOODS = load()

# Apelidos dos alimentos usados (fonte:código).
F = {
    'arroz': 'TACO:3', 'arroz_int': 'TACO:1', 'feijao': 'TACO:561', 'feijao_preto': 'TACO:567', 'lentilha': 'TACO:577',
    'grao_bico': 'IBGE:6302801-99', 'quinoa': 'IBGE:6304901-99', 'ervilha': 'IBGE:6301101-99',
    'pao': 'TACO:53', 'pao_int': 'TACO:52', 'tapioca': 'TACO:551', 'cuscuz': 'TACO:533', 'aveia': 'TACO:7',
    'batata_doce': 'TACO:88', 'mandioca': 'TACO:129', 'batata': 'TACO:91', 'inhame': 'IBGE:6400501-2',
    'ovo': 'TACO:488', 'queijo_minas': 'TACO:461', 'ricota': 'TACO:469', 'iogurte': 'TACO:448', 'iogurte_desn': 'TACO:449',
    'leite': 'IBGE:7900101-99', 'leite_desn': 'IBGE:7903601-99', 'tofu': 'TACO:584', 'bebida_soja': 'TACO:582',
    'frango': 'TACO:410', 'patinho': 'TACO:377', 'carne_moida': 'TACO:326', 'peixe': 'TACO:313', 'merluza': 'TACO:301',
    'sardinha': 'TACO:318', 'salmao': 'TACO:317', 'figado': 'TACO:356',
    'azeite': 'TACO:260', 'oleo': 'TACO:272', 'castanha': 'TACO:589', 'amendoim': 'TACO:557', 'linhaca': 'TACO:594',
    'noz': 'TACO:597', 'pasta_amendoim': 'IBGE:6901203-99',
    'cafe': 'TACO:471', 'mel': 'TACO:507',
    'alface': 'TACO:78', 'tomate': 'TACO:157', 'cenoura': 'TACO:110', 'brocolis': 'TACO:100', 'abobrinha': 'TACO:72',
    'couve': 'TACO:116', 'beterraba': 'TACO:97', 'chuchu': 'TACO:112', 'pepino': 'TACO:142', 'repolho': 'TACO:149',
    'couve_flor': 'TACO:118', 'abobora': 'TACO:64', 'berinjela': 'TACO:95', 'rucula': 'TACO:152', 'vagem': 'TACO:162',
    'banana': 'TACO:182', 'mamao': 'TACO:226', 'maca': 'TACO:222', 'laranja': 'TACO:214', 'melancia': 'TACO:235',
    'morango': 'TACO:239', 'abacate': 'TACO:163', 'mexerica': 'TACO:238', 'goiaba': 'TACO:200', 'kiwi': 'TACO:207',
    'manga': 'TACO:229', 'uva': 'TACO:256', 'pera': 'TACO:243', 'abacaxi': 'TACO:164',
    'melao': 'TACO:236', 'ameixa': 'TACO:172', 'requeijao': 'TACO:468', 'biscoito_maisena': 'TACO:8', 'cracker': 'TACO:13',
    'bolo_choc': 'TACO:16', 'chocolate': 'TACO:495', 'macarrao_bolonhesa': 'TACO:542', 'pipoca': 'TACO:61', 'pao_aveia': 'TACO:48',
}

# Substituições por alimento (mesma energia), na ordem em que aparecem.
SUBS = {
    'arroz': ['arroz_int', 'batata', 'mandioca'], 'arroz_int': ['arroz', 'quinoa', 'batata_doce'],
    'feijao': ['feijao_preto', 'lentilha', 'grao_bico'], 'feijao_preto': ['feijao', 'lentilha'], 'lentilha': ['feijao', 'grao_bico'],
    'grao_bico': ['lentilha', 'feijao'], 'pao': ['pao_int', 'cuscuz', 'tapioca'], 'pao_int': ['pao', 'cuscuz', 'aveia'],
    'cuscuz': ['pao', 'batata_doce', 'tapioca'], 'batata_doce': ['mandioca', 'inhame', 'batata'], 'mandioca': ['batata_doce', 'inhame'],
    'tapioca': ['cuscuz', 'pao'],
    'frango': ['patinho', 'peixe', 'ovo'], 'patinho': ['frango', 'carne_moida', 'peixe'], 'peixe': ['merluza', 'sardinha', 'frango'],
    'sardinha': ['peixe', 'salmao'], 'salmao': ['sardinha', 'peixe'], 'carne_moida': ['patinho', 'frango'],
    'ovo': ['queijo_minas', 'ricota'], 'queijo_minas': ['ricota', 'ovo'], 'tofu': ['grao_bico', 'lentilha'],
    'leite': ['iogurte'], 'leite_desn': ['iogurte_desn'], 'iogurte': ['leite'], 'iogurte_desn': ['leite_desn'],
    'bebida_soja': [],
    'banana': ['maca', 'pera', 'manga'], 'mamao': ['melancia', 'abacaxi', 'morango'], 'maca': ['pera', 'banana', 'goiaba'],
    'laranja': ['mexerica', 'goiaba', 'kiwi'], 'mexerica': ['laranja', 'kiwi'], 'melancia': ['mamao', 'abacaxi'],
    'morango': ['uva', 'kiwi'], 'goiaba': ['laranja', 'kiwi'], 'kiwi': ['laranja', 'goiaba'], 'manga': ['banana', 'mamao'],
    'pera': ['maca'], 'uva': ['morango'], 'abacaxi': ['melancia'], 'melao': ['mamao', 'pera'], 'ameixa': ['mamao', 'pera'],
    'requeijao': ['queijo_minas', 'ricota'], 'cracker': ['pao', 'biscoito_maisena'], 'biscoito_maisena': ['cracker', 'pao'],
    'castanha': ['noz', 'amendoim'], 'noz': ['castanha', 'amendoim'], 'amendoim': ['castanha', 'noz'],
}

# Classe -> expoente do fator k (quantidade = base × k^e). Verduras e café ficam fixos.
CLASS = {'veg': 0.0, 'drink': 0.0, 'fruit': 0.35, 'dairy': 0.45, 'protein': 0.55, 'legume': 0.7, 'starch': 1.0, 'fat': 1.0}
CLASS_OF = {}
for k in ['alface', 'tomate', 'cenoura', 'brocolis', 'abobrinha', 'couve', 'beterraba', 'chuchu', 'pepino', 'repolho', 'couve_flor', 'abobora', 'berinjela', 'rucula', 'vagem']:
    CLASS_OF[k] = 'veg'
for k in ['cafe']:
    CLASS_OF[k] = 'drink'
for k in ['banana', 'mamao', 'maca', 'laranja', 'melancia', 'morango', 'abacate', 'mexerica', 'goiaba', 'kiwi', 'manga', 'uva', 'pera', 'abacaxi', 'melao', 'ameixa']:
    CLASS_OF[k] = 'fruit'
for k in ['leite', 'leite_desn', 'iogurte', 'iogurte_desn', 'bebida_soja', 'requeijao']:
    CLASS_OF[k] = 'dairy'
for k in ['frango', 'patinho', 'carne_moida', 'peixe', 'merluza', 'sardinha', 'salmao', 'figado', 'ovo', 'queijo_minas', 'ricota', 'tofu']:
    CLASS_OF[k] = 'protein'
for k in ['feijao', 'feijao_preto', 'lentilha', 'grao_bico', 'ervilha']:
    CLASS_OF[k] = 'legume'
for k in ['arroz', 'arroz_int', 'quinoa', 'pao', 'pao_int', 'tapioca', 'cuscuz', 'aveia', 'batata_doce', 'mandioca', 'batata', 'inhame', 'mel',
          'biscoito_maisena', 'cracker', 'macarrao_bolonhesa', 'pipoca', 'pao_aveia', 'bolo_choc', 'chocolate']:
    CLASS_OF[k] = 'starch'
for k in ['azeite', 'oleo', 'castanha', 'amendoim', 'linhaca', 'noz', 'pasta_amendoim']:
    CLASS_OF[k] = 'fat'

MEAL_INFO = {
    'cafe': ('Café da manhã', '07:00'), 'lanche-manha': ('Lanche da manhã', '10:00'), 'almoco': ('Almoço', '12:30'),
    'lanche-tarde': ('Lanche da tarde', '16:00'), 'jantar': ('Jantar', '19:30'), 'ceia': ('Ceia', '21:30'),
    'pre-treino': ('Pré-treino', '17:00'), 'pos-treino': ('Pós-treino', '19:00'),
}

# ── Padrões (quantidades em gramas na base de ~2.000 kcal) ───────────────────────────────────────────────
SALAD = [('alface', 30), ('tomate', 60), ('cenoura', 30)]

PATTERNS = {
    'tradicional': {
        'name': 'Tradicional brasileiro',
        'tags': ['tradicional', 'guia alimentar'],
        'protein_per_kg': 1.2, 'lipid_pct': 28,
        'summary': 'Arroz, feijão, carne magra, verduras e frutas em todas as refeições principais, como no Guia Alimentar.',
        'meals': {
            'cafe': [('pao', 50), ('queijo_minas', 30), ('leite', 150), ('cafe', 50), ('mamao', 150)],
            'lanche-manha': [('banana', 85)],
            'almoco': SALAD + [('arroz', 140), ('feijao', 120), ('frango', 80), ('abobrinha', 70), ('azeite', 6), ('laranja', 150)],
            'lanche-tarde': [('iogurte', 170), ('aveia', 20), ('castanha', 8)],
            'jantar': [('alface', 30), ('tomate', 60), ('arroz', 110), ('feijao', 90), ('patinho', 70), ('brocolis', 80), ('azeite', 5)],
        },
        'guidelines': [
            'Base do dia: comida de verdade (alimentos in natura e minimamente processados). Use óleo, sal e açúcar em pequenas quantidades para temperar e cozinhar.',
            'Metade do prato do almoço e do jantar com verduras e legumes; um quarto com arroz ou outro cereal/tubérculo; o resto com feijão e uma porção de carne, frango, peixe ou ovos.',
            'Prefira água ao longo do dia (cerca de 2 litros, ajustando ao calor e à atividade física).',
            'Evite refrigerantes, salgadinhos de pacote, biscoitos recheados, embutidos e outros ultraprocessados.',
            'Faça as refeições em horários regulares, com atenção e, se possível, em companhia.',
        ],
    },
    'vegetariano': {
        'name': 'Ovolactovegetariano',
        'tags': ['vegetariano'],
        'protein_per_kg': 1.2, 'lipid_pct': 30,
        'summary': 'Sem carnes: proteína de ovos, laticínios e leguminosas (feijão, lentilha, grão-de-bico) em todas as refeições principais.',
        'meals': {
            'cafe': [('pao_int', 50), ('ovo', 50), ('leite', 150), ('cafe', 50), ('mamao', 150)],
            'lanche-manha': [('banana', 85), ('castanha', 8)],
            'almoco': SALAD + [('arroz_int', 120), ('feijao', 140), ('ovo', 100), ('brocolis', 80), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('iogurte', 170), ('aveia', 20), ('linhaca', 5)],
            'jantar': [('alface', 30), ('tomate', 60), ('arroz_int', 100), ('lentilha', 130), ('queijo_minas', 40), ('abobrinha', 80), ('azeite', 8)],
        },
        'guidelines': [
            'Feijão, lentilha, grão-de-bico ou ervilha no almoço e no jantar: são a principal fonte de proteína e de ferro.',
            'Junte uma fruta rica em vitamina C (laranja, goiaba, acerola, kiwi) às refeições com leguminosas para aproveitar melhor o ferro.',
            'Ovos e laticínios garantem proteína completa e vitamina B12; acompanhe a B12 e o ferro nos exames.',
            'Varie os cereais integrais (arroz integral, aveia, pão integral) e inclua oleaginosas e sementes no dia.',
        ],
    },
    'vegano': {
        'name': 'Vegano',
        'tags': ['vegano', 'vegetariano'],
        'protein_per_kg': 1.2, 'lipid_pct': 30,
        'summary': 'Só alimentos de origem vegetal: leguminosas em todas as refeições principais, tofu, bebida de soja, cereais integrais e oleaginosas.',
        'meals': {
            'cafe': [('pao_int', 60), ('pasta_amendoim', 15), ('bebida_soja', 200), ('banana', 85)],
            'lanche-manha': [('mamao', 150), ('castanha', 10)],
            'almoco': SALAD + [('arroz_int', 130), ('feijao', 150), ('tofu', 100), ('brocolis', 80), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('bebida_soja', 200), ('aveia', 25), ('linhaca', 10), ('morango', 100)],
            'jantar': [('rucula', 30), ('tomate', 60), ('quinoa', 120), ('grao_bico', 120), ('abobora', 100), ('azeite', 8)],
        },
        'guidelines': [
            'Vitamina B12: não há fonte vegetal confiável. A suplementação é necessária e deve ser prescrita e acompanhada.',
            'Leguminosas (feijão, lentilha, grão-de-bico, tofu) no almoço e no jantar; combine com cereais ao longo do dia.',
            'Fruta rica em vitamina C junto das refeições com leguminosas, para aproveitar o ferro.',
            'Cálcio: prefira bebida vegetal enriquecida com cálcio, tofu, couve e brócolis. Acompanhe ferro, B12, vitamina D e ômega-3.',
            'Uma colher de linhaça moída por dia e oleaginosas (castanhas, nozes) ajudam no ômega-3 e nas calorias.',
        ],
    },
    'mediterraneo': {
        'name': 'Mediterrâneo adaptado',
        'tags': ['mediterrâneo', 'cardiovascular'],
        'protein_per_kg': 1.2, 'lipid_pct': 33,
        'summary': 'Azeite como gordura principal, peixe várias vezes na semana, cereais integrais, leguminosas, oleaginosas, verduras e frutas.',
        'meals': {
            'cafe': [('pao_int', 50), ('ricota', 40), ('tomate', 40), ('azeite', 5), ('cafe', 50), ('morango', 120)],
            'lanche-manha': [('iogurte', 170), ('noz', 10)],
            'almoco': [('rucula', 30), ('tomate', 60), ('pepino', 40), ('arroz_int', 130), ('grao_bico', 80), ('peixe', 100), ('berinjela', 80), ('azeite', 10), ('laranja', 150)],
            'lanche-tarde': [('maca', 130), ('castanha', 10)],
            'jantar': [('alface', 30), ('cenoura', 30), ('quinoa', 120), ('lentilha', 100), ('sardinha', 80), ('abobrinha', 80), ('azeite', 10)],
        },
        'guidelines': [
            'Azeite de oliva como gordura de preparo e tempero, em pequenas quantidades.',
            'Peixe pelo menos 2 a 3 vezes por semana (sardinha, pescada, salmão); carne vermelha no máximo 1 a 2 vezes por semana.',
            'Leguminosas quase todos os dias e um punhado pequeno de oleaginosas sem sal.',
            'Cereais integrais no lugar dos refinados; verduras e frutas em todas as refeições.',
            'Evite embutidos, frituras e doces; ervas e especiarias no lugar do excesso de sal.',
        ],
    },
    'dash': {
        'name': 'DASH (pressão arterial)',
        'tags': ['dash', 'hipertensão', 'baixo sódio'],
        'protein_per_kg': 1.0, 'lipid_pct': 27,
        'summary': 'Rico em frutas, verduras, laticínios desnatados, cereais integrais e oleaginosas sem sal; pouco sódio, gordura saturada e açúcar.',
        'meals': {
            'cafe': [('pao_int', 50), ('ricota', 30), ('leite_desn', 200), ('mamao', 150)],
            'lanche-manha': [('banana', 85), ('amendoim', 10)],
            'almoco': [('alface', 30), ('tomate', 60), ('beterraba', 50), ('arroz_int', 130), ('feijao', 120), ('frango', 80), ('couve', 60), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('iogurte_desn', 170), ('aveia', 20), ('morango', 100)],
            'jantar': [('alface', 30), ('cenoura', 40), ('batata_doce', 170), ('peixe', 90), ('brocolis', 90), ('azeite', 8), ('melancia', 200)],
        },
        'guidelines': [
            'Sal: no máximo 5 g por dia (1 colher de chá rasa), já somando o sal do preparo. Tempere com alho, cebola, ervas, limão e especiarias.',
            'Evite embutidos, temperos prontos, caldos em tablete, enlatados, salgadinhos e queijos amarelos: concentram sódio.',
            'Frutas e verduras em todas as refeições (fonte de potássio e magnésio) e laticínios desnatados duas a três vezes por dia.',
            'Oleaginosas sem sal (amendoim, castanhas) em porções pequenas, quase todos os dias.',
            'Leia os rótulos: prefira produtos com menos sódio por porção.',
        ],
    },
    'glicemico': {
        'name': 'Controle glicêmico',
        'tags': ['diabetes', 'controle glicêmico', 'resistência à insulina'],
        'protein_per_kg': 1.2, 'lipid_pct': 30,
        'summary': 'Carboidratos integrais distribuídos ao longo do dia, sempre com fibra e proteína; sem açúcar de adição.',
        'meals': {
            'cafe': [('pao_int', 50), ('ovo', 50), ('queijo_minas', 20), ('cafe', 50), ('mamao', 120), ('linhaca', 5)],
            'lanche-manha': [('maca', 130), ('castanha', 8)],
            'almoco': [('alface', 30), ('tomate', 60), ('cenoura', 30), ('arroz_int', 110), ('feijao', 140), ('frango', 90), ('brocolis', 90), ('azeite', 8)],
            'lanche-tarde': [('iogurte', 170), ('aveia', 20), ('morango', 80)],
            'jantar': [('alface', 30), ('pepino', 40), ('batata_doce', 120), ('lentilha', 100), ('peixe', 90), ('couve_flor', 90), ('azeite', 8)],
            'ceia': [('leite', 150)],
        },
        'guidelines': [
            'Não pule refeições e mantenha horários regulares: ajuda a evitar picos e quedas da glicemia.',
            'Comece o almoço e o jantar pela salada e inclua sempre feijão ou outra leguminosa.',
            'Prefira frutas inteiras (com casca e bagaço) a sucos, e combine-as com uma fonte de proteína ou oleaginosa.',
            'Sem açúcar, mel ou doces no dia a dia; cuidado com pães, biscoitos e bebidas adoçadas.',
            'Ajuste a distribuição dos carboidratos ao tratamento (insulina ou medicamentos) e à atividade física.',
        ],
    },
    'gestante': {
        'name': 'Gestante',
        'tags': ['gestante', 'materno-infantil'],
        'protein_per_kg': 1.1, 'lipid_pct': 28,
        'summary': 'Para o 2º e o 3º trimestre: laticínios três vezes ao dia, ferro com vitamina C, folhas verde-escuras e peixe de baixo mercúrio.',
        'meals': {
            'cafe': [('pao_int', 50), ('queijo_minas', 30), ('leite', 200), ('mamao', 150)],
            'lanche-manha': [('iogurte', 170), ('banana', 85)],
            'almoco': [('alface', 30), ('tomate', 60), ('cenoura', 30), ('arroz', 130), ('feijao', 140), ('patinho', 80), ('couve', 60), ('azeite', 5), ('laranja', 150)],
            'lanche-tarde': [('pao', 50), ('ovo', 50), ('goiaba', 120)],
            'jantar': [('alface', 30), ('beterraba', 50), ('arroz', 100), ('feijao', 100), ('sardinha', 80), ('brocolis', 80), ('azeite', 5)],
            'ceia': [('leite', 150), ('aveia', 15)],
        },
        'guidelines': [
            'Suplementos (ácido fólico, ferro e outros) somente conforme prescrição e acompanhamento do pré-natal.',
            'Carnes, peixes e ovos sempre bem cozidos; nada de leite cru ou queijo de leite não pasteurizado; lave bem frutas e verduras.',
            'Prefira peixes de baixo mercúrio (sardinha, pescada, tilápia) e evite os grandes predadores (cação, atum fresco, peixe-espada).',
            'Sem bebida alcoólica. Café com moderação (até 2 xícaras pequenas por dia).',
            'Fracione em 6 refeições se houver enjoo ou azia; beba água ao longo do dia.',
        ],
    },
    'idoso': {
        'name': 'Pessoa idosa',
        'tags': ['idoso', 'pessoa idosa'],
        'protein_per_kg': 1.2, 'lipid_pct': 28,
        'summary': 'Proteína distribuída nas refeições, laticínios três vezes ao dia, preparações macias, fibra e boa hidratação.',
        'meals': {
            'cafe': [('pao', 50), ('ovo', 50), ('leite', 200), ('mamao', 150)],
            'lanche-manha': [('iogurte', 170), ('banana', 85)],
            'almoco': [('alface', 20), ('tomate', 50), ('arroz', 110), ('feijao', 120), ('carne_moida', 90), ('abobora', 90), ('azeite', 5), ('laranja', 150)],
            'lanche-tarde': [('leite', 150), ('aveia', 20), ('maca', 110)],
            'jantar': [('cenoura', 40), ('batata', 150), ('frango', 90), ('chuchu', 90), ('azeite', 5)],
            'ceia': [('iogurte', 120)],
        },
        'guidelines': [
            'Uma fonte de proteína (ovo, leite, iogurte, carne, frango, peixe ou feijão) em cada refeição ajuda a manter a massa muscular.',
            'Beba água mesmo sem sede (a sensação de sede diminui com a idade): deixe uma garrafa à vista.',
            'Prefira preparações macias (carne moída ou desfiada, legumes bem cozidos) se houver dificuldade para mastigar.',
            'Laticínios três vezes ao dia para o cálcio; sol pela manhã ajuda na vitamina D (avalie a suplementação).',
            'Cuidado com o sal e com chás ou suplementos sem orientação, por causa dos medicamentos.',
        ],
    },
    'escolar': {
        'name': 'Criança em idade escolar (6 a 10 anos)',
        'tags': ['infantil', 'escolar', 'materno-infantil'],
        'protein_per_kg': 1.0, 'lipid_pct': 30,
        'summary': 'Refeições da família em porções menores, lanche escolar sem ultraprocessados, frutas e leite todos os dias.',
        'meals': {
            'cafe': [('pao', 50), ('queijo_minas', 20), ('leite', 200), ('banana', 85)],
            'lanche-manha': [('maca', 110), ('pao', 25), ('queijo_minas', 15)],
            'almoco': [('alface', 15), ('tomate', 40), ('cenoura', 20), ('arroz', 100), ('feijao', 90), ('frango', 50), ('abobrinha', 40), ('azeite', 5), ('laranja', 130)],
            'lanche-tarde': [('iogurte', 170), ('aveia', 15), ('morango', 80)],
            'jantar': [('arroz', 90), ('feijao', 70), ('patinho', 40), ('brocolis', 50), ('azeite', 5)],
        },
        'guidelines': [
            'Lancheira: fruta, sanduíche simples (pão com ovo, queijo ou frango) e água. Evite suco de caixinha, refrigerante, biscoito recheado e salgadinho.',
            'Coma em família e sem telas; deixe a criança servir e experimentar novos alimentos sem pressão.',
            'Ofereça o alimento recusado outras vezes, em preparações diferentes: a aceitação vem com a repetição.',
            'Doces e bebidas adoçadas não são recompensa; guarde-os para ocasiões especiais.',
        ],
    },
}


# ── Perfis acrescentados em 23/11/2026: esportivo, materno-infantil, clínicos e transtornos alimentares ──────
# Base técnica (texto próprio): posicionamentos de nutrição esportiva (ACSM/AND/DC 2016, ISSN), DRIs e Guia
# Alimentar para crianças menores de 2 anos (MS, 2019), consensos de dislipidemia (SBC) e de DRGE, e diretrizes de
# tratamento nutricional de transtornos alimentares (APA 2023, abordagem de alimentação regular e estruturada).
PATTERNS.update({
    'hipertrofia': {
        'name': 'Esportivo — hipertrofia',
        'tags': ['esportivo', 'hipertrofia', 'ganho de massa'],
        'protein_per_kg': 1.8, 'lipid_pct': 25,
        'summary': 'Proteína de 1,6 a 2,2 g/kg distribuída em 5 a 6 refeições, carboidrato antes e depois do treino e superávit calórico moderado.',
        'times': {'jantar': '21:00'},
        'meals': {
            'cafe': [('pao', 50), ('ovo', 100), ('queijo_minas', 30), ('leite', 200), ('banana', 85)],
            'lanche-manha': [('iogurte', 170), ('aveia', 30), ('castanha', 10)],
            'almoco': SALAD + [('arroz', 160), ('feijao', 120), ('frango', 130), ('brocolis', 80), ('azeite', 6), ('laranja', 150)],
            'pre-treino': [('pao', 50), ('mel', 15), ('banana', 85)],
            'pos-treino': [('leite', 250), ('aveia', 20), ('ovo', 50)],
            'jantar': [('alface', 30), ('tomate', 60), ('batata_doce', 200), ('patinho', 130), ('abobrinha', 80), ('azeite', 6)],
        },
        'guidelines': [
            'Proteína em todas as refeições (ovos, laticínios, carnes, frango, peixe, leguminosas), em porções de 20 a 40 g de proteína.',
            'Pré-treino (1 a 2 h antes): carboidrato de fácil digestão com pouca gordura e fibra.',
            'Pós-treino: proteína com carboidrato em até 2 horas, junto da refeição seguinte se for perto.',
            'Hidratação: beba água ao longo do dia e reponha o que perder no treino (pese-se antes e depois para estimar).',
            'Suplementos (whey, creatina e outros) só com indicação e prescrição individual.',
        ],
    },
    'endurance': {
        'name': 'Esportivo — endurance (corrida, ciclismo)',
        'tags': ['esportivo', 'endurance', 'corrida', 'ciclismo'],
        'protein_per_kg': 1.4, 'lipid_pct': 25,
        'summary': 'Carboidrato alto (5 a 8 g/kg conforme o volume de treino), proteína moderada e refeições antes e depois das sessões.',
        'times': {'jantar': '21:00'},
        'meals': {
            'cafe': [('pao', 70), ('mel', 15), ('queijo_minas', 30), ('leite', 200), ('banana', 85), ('aveia', 20)],
            'lanche-manha': [('iogurte', 170), ('manga', 120)],
            'almoco': SALAD + [('arroz', 200), ('feijao', 120), ('frango', 100), ('cenoura', 50), ('azeite', 6), ('laranja', 150)],
            'pre-treino': [('tapioca', 60), ('banana', 85)],
            'pos-treino': [('leite', 250), ('pao', 50), ('mel', 10)],
            'jantar': [('alface', 30), ('tomate', 60), ('macarrao_bolonhesa', 300), ('brocolis', 80), ('azeite', 5)],
        },
        'guidelines': [
            'Ajuste o carboidrato ao treino do dia: mais nos dias longos ou intensos, menos nos dias leves ou de descanso.',
            'Em treinos acima de 60 a 90 minutos, use carboidrato durante a atividade (30 a 60 g por hora: gel, bebida esportiva, banana, rapadura).',
            'Pré-treino com pouca fibra e gordura para evitar desconforto gastrointestinal; teste as estratégias nos treinos, nunca na prova.',
            'Reidrate-se após o treino com cerca de 1,5 L para cada kg perdido, com sódio se o suor for intenso.',
            'Ferro, cálcio e vitamina D merecem atenção, principalmente em mulheres atletas.',
        ],
    },
    'definicao': {
        'name': 'Esportivo — definição',
        'tags': ['esportivo', 'definição', 'composição corporal'],
        'protein_per_kg': 2.0, 'lipid_pct': 25,
        'summary': 'Déficit calórico moderado com proteína alta (1,8 a 2,4 g/kg) para preservar a massa magra, carboidrato perto do treino e muita fibra.',
        'times': {'jantar': '21:00'},
        'meals': {
            'cafe': [('pao_int', 50), ('ovo', 100), ('cafe', 50), ('mamao', 150)],
            'lanche-manha': [('iogurte_desn', 170), ('morango', 100)],
            'almoco': SALAD + [('arroz_int', 110), ('feijao', 100), ('frango', 140), ('brocolis', 100), ('azeite', 5)],
            'pre-treino': [('banana', 85), ('aveia', 15)],
            'pos-treino': [('leite_desn', 250), ('ovo', 50)],
            'jantar': [('alface', 30), ('pepino', 60), ('batata_doce', 120), ('peixe', 150), ('abobrinha', 100), ('azeite', 5)],
        },
        'guidelines': [
            'Déficit moderado (300 a 500 kcal por dia) e perda de 0,5 a 1% do peso por semana preservam melhor a massa muscular.',
            'Proteína alta e distribuída nas refeições; mantenha o treino de força.',
            'Concentre o carboidrato antes e depois do treino; verduras à vontade nas refeições para saciedade.',
            'Durma bem e acompanhe a evolução pela composição corporal, não só pelo peso.',
        ],
    },
    'lactante': {
        'name': 'Lactante',
        'tags': ['lactante', 'amamentação', 'materno-infantil'],
        'protein_per_kg': 1.3, 'lipid_pct': 28,
        'summary': 'Para quem amamenta: adicional de energia, laticínios três vezes ao dia, peixe de baixo mercúrio, ferro com vitamina C e muita água.',
        'meals': {
            'cafe': [('pao_int', 60), ('ovo', 50), ('queijo_minas', 30), ('leite', 200), ('mamao', 150)],
            'lanche-manha': [('iogurte', 170), ('aveia', 20), ('banana', 85)],
            'almoco': SALAD + [('arroz', 150), ('feijao', 140), ('patinho', 100), ('couve', 60), ('azeite', 6), ('laranja', 150)],
            'lanche-tarde': [('pao', 50), ('queijo_minas', 30), ('goiaba', 120), ('castanha', 10)],
            'jantar': [('alface', 30), ('beterraba', 50), ('arroz', 120), ('feijao', 100), ('sardinha', 90), ('brocolis', 80), ('azeite', 5)],
            'ceia': [('leite', 200), ('aveia', 15)],
        },
        'guidelines': [
            'Beba um copo de água a cada mamada e mantenha uma garrafa por perto: a necessidade de líquidos aumenta.',
            'Não faça dietas restritivas durante a amamentação; a perda de peso deve ser gradual.',
            'Peixes de baixo mercúrio (sardinha, tilápia, pescada) 2 a 3 vezes por semana ajudam no DHA do leite.',
            'Sem bebida alcoólica; café com moderação. Suplementos só com prescrição.',
            'Amamentação exclusiva até 6 meses e continuada até 2 anos ou mais.',
        ],
    },
    'primeira_infancia': {
        'name': 'Criança de 1 a 3 anos',
        'tags': ['infantil', 'primeira infância', 'materno-infantil'],
        'protein_per_kg': 1.1, 'lipid_pct': 33,
        'summary': 'Comida da família amassada ou em pedaços pequenos, leite (materno ou de vaca) e frutas, sem açúcar e sem ultraprocessados.',
        'meals': {
            'cafe': [('leite', 200), ('pao', 25), ('ovo', 25), ('mamao', 60)],
            'lanche-manha': [('banana', 60)],
            'almoco': [('arroz', 50), ('feijao', 50), ('carne_moida', 30), ('cenoura', 30), ('abobora', 30), ('azeite', 3), ('laranja', 60)],
            'lanche-tarde': [('iogurte', 120), ('pera', 60)],
            'jantar': [('arroz', 40), ('feijao', 40), ('frango', 25), ('brocolis', 30), ('azeite', 3)],
            'ceia': [('leite', 150)],
        },
        'guidelines': [
            'Sem açúcar e sem ultraprocessados até os 2 anos (bolachas, sucos de caixinha, salgadinhos, embutidos, refrigerante).',
            'Ofereça os alimentos em pedaços pequenos e macios; evite os de risco de engasgo (uva inteira, pipoca, castanha inteira).',
            'A criança regula o quanto come: ofereça e respeite a saciedade, sem forçar nem usar comida como recompensa.',
            'Água várias vezes ao dia; leite materno pode continuar até 2 anos ou mais.',
            'As quantidades são uma referência: o apetite varia de um dia para o outro.',
        ],
    },
    'pre_escolar': {
        'name': 'Criança pré-escolar (4 a 5 anos)',
        'tags': ['infantil', 'pré-escolar', 'materno-infantil'],
        'protein_per_kg': 1.0, 'lipid_pct': 30,
        'summary': 'Refeições da família em porções de criança, leite e derivados todos os dias, frutas no lanche e rotina de horários.',
        'meals': {
            'cafe': [('leite', 200), ('pao', 40), ('queijo_minas', 15), ('banana', 70)],
            'lanche-manha': [('maca', 90)],
            'almoco': [('alface', 10), ('tomate', 30), ('arroz', 80), ('feijao', 70), ('frango', 40), ('cenoura', 30), ('azeite', 4), ('laranja', 100)],
            'lanche-tarde': [('iogurte', 150), ('aveia', 10), ('morango', 60)],
            'jantar': [('arroz', 70), ('feijao', 50), ('patinho', 35), ('abobrinha', 40), ('azeite', 4)],
        },
        'guidelines': [
            'Refeições em família, sem telas, com horários regulares.',
            'Envolva a criança no preparo e na escolha das frutas e verduras: aumenta a aceitação.',
            'Ofereça o alimento recusado outras vezes, em preparações diferentes.',
            'Doces e bebidas adoçadas não são recompensa nem rotina.',
        ],
    },
    'adolescente': {
        'name': 'Adolescente',
        'tags': ['adolescente', 'materno-infantil'],
        'protein_per_kg': 1.2, 'lipid_pct': 28,
        'summary': 'Energia para o estirão de crescimento, cálcio (laticínios três vezes ao dia), ferro e café da manhã todos os dias.',
        'meals': {
            'cafe': [('pao', 60), ('ovo', 50), ('queijo_minas', 30), ('leite', 200), ('banana', 85)],
            'lanche-manha': [('iogurte', 170), ('maca', 110)],
            'almoco': SALAD + [('arroz', 150), ('feijao', 120), ('patinho', 100), ('brocolis', 70), ('azeite', 6), ('laranja', 150)],
            'lanche-tarde': [('pao', 50), ('queijo_minas', 30), ('leite', 200), ('mamao', 120)],
            'jantar': [('alface', 30), ('tomate', 60), ('arroz', 130), ('feijao', 100), ('frango', 90), ('cenoura', 60), ('azeite', 5)],
        },
        'guidelines': [
            'Não pule o café da manhã: melhora a atenção na escola e evita exageros mais tarde.',
            'Laticínios três vezes ao dia (cálcio para os ossos) e feijão com fruta cítrica (ferro).',
            'Lanches práticos e de verdade: frutas, sanduíche natural, iogurte, castanhas.',
            'Fast-food, refrigerante e energéticos só ocasionalmente.',
            'Evite comentários sobre peso e corpo; observe sinais de dietas restritivas ou compensações.',
        ],
    },
    'emagrecimento': {
        'name': 'Emagrecimento',
        'tags': ['emagrecimento', 'perda de peso', 'obesidade'],
        'protein_per_kg': 1.4, 'lipid_pct': 28,
        'summary': 'Déficit calórico moderado com proteína em todas as refeições, verduras à vontade, fibras e sem ultraprocessados.',
        'meals': {
            'cafe': [('pao_int', 50), ('ovo', 50), ('cafe', 50), ('mamao', 150)],
            'lanche-manha': [('iogurte_desn', 170), ('linhaca', 5)],
            'almoco': [('alface', 40), ('tomate', 80), ('pepino', 50), ('arroz_int', 100), ('feijao', 120), ('frango', 110), ('abobrinha', 100), ('azeite', 5)],
            'lanche-tarde': [('maca', 130), ('castanha', 8)],
            'jantar': [('alface', 40), ('cenoura', 40), ('batata_doce', 100), ('peixe', 120), ('brocolis', 100), ('azeite', 5)],
        },
        'guidelines': [
            'Déficit moderado e sustentável: o objetivo é um padrão alimentar que dê para manter, não uma dieta temporária.',
            'Comece o almoço e o jantar pela salada e pelos legumes; proteína em todas as refeições aumenta a saciedade.',
            'Coma devagar, sem telas, e observe os sinais de fome e saciedade.',
            'Evite bebidas adoçadas e alcoólicas, ultraprocessados e beliscos fora de hora.',
            'Combine com atividade física regular, incluindo exercício de força.',
        ],
    },
    'gastrite': {
        'name': 'Gastrite e refluxo',
        'tags': ['gastrite', 'refluxo', 'drge', 'gastrointestinal'],
        'protein_per_kg': 1.2, 'lipid_pct': 25,
        'summary': 'Refeições menores e fracionadas, preparações cozidas e com pouca gordura, sem café, álcool, frituras e alimentos ácidos ou picantes.',
        'meals': {
            'cafe': [('pao', 50), ('queijo_minas', 30), ('leite_desn', 200), ('mamao', 150)],
            'lanche-manha': [('banana', 85)],
            'almoco': [('alface', 20), ('cenoura', 40), ('arroz', 130), ('feijao', 100), ('frango', 90), ('chuchu', 80), ('azeite', 5), ('pera', 120)],
            'lanche-tarde': [('iogurte_desn', 170), ('aveia', 15)],
            'jantar': [('arroz', 100), ('frango', 80), ('abobrinha', 80), ('batata', 100), ('azeite', 5)],
            'ceia': [('maca', 110)],
        },
        'guidelines': [
            'Faça 5 a 6 refeições menores, mastigue bem e coma devagar.',
            'Evite café, chá preto e mate, refrigerantes, álcool, pimenta, frituras, molhos prontos e embutidos; teste a tolerância a cítricos e tomate.',
            'No refluxo: jante pelo menos 2 a 3 horas antes de deitar e eleve a cabeceira da cama.',
            'Prefira preparações cozidas, assadas ou grelhadas, com pouca gordura.',
            'Quem fuma: parar ajuda muito no refluxo.',
        ],
    },
    'constipacao': {
        'name': 'Intestino preso (constipação)',
        'tags': ['constipação', 'intestino', 'fibras', 'gastrointestinal'],
        'protein_per_kg': 1.0, 'lipid_pct': 28,
        'summary': 'Fibras de cereais integrais, leguminosas, frutas com casca e verduras em todas as refeições, com bastante água.',
        'meals': {
            'cafe': [('pao_int', 50), ('ricota', 30), ('cafe', 50), ('mamao', 170), ('linhaca', 10)],
            'lanche-manha': [('ameixa', 100), ('iogurte', 170)],
            'almoco': [('alface', 40), ('tomate', 60), ('cenoura', 40), ('arroz_int', 130), ('feijao', 140), ('frango', 90), ('couve', 60), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('aveia', 30), ('leite', 200), ('pera', 130)],
            'jantar': [('alface', 30), ('beterraba', 50), ('batata_doce', 150), ('lentilha', 120), ('peixe', 90), ('brocolis', 80), ('azeite', 8)],
        },
        'guidelines': [
            'Aumente as fibras aos poucos e beba bastante água (2 litros ou mais): fibra sem água pode piorar o intestino.',
            'Frutas com casca e bagaço (laranja, mamão, ameixa, pera), aveia, linhaça e feijão todos os dias.',
            'Mantenha horário para ir ao banheiro, de preferência após o café da manhã, e não segure a vontade.',
            'Atividade física regular ajuda o intestino a funcionar.',
        ],
    },
    'dislipidemia': {
        'name': 'Colesterol e triglicerídeos (dislipidemia)',
        'tags': ['dislipidemia', 'colesterol', 'triglicerídeos', 'cardiovascular'],
        'protein_per_kg': 1.1, 'lipid_pct': 28,
        'summary': 'Pouca gordura saturada e trans, aveia e leguminosas (fibra solúvel), peixe, azeite e oleaginosas; pouco açúcar e álcool.',
        'meals': {
            'cafe': [('pao_int', 50), ('ricota', 30), ('leite_desn', 200), ('mamao', 150)],
            'lanche-manha': [('maca', 130), ('noz', 10)],
            'almoco': SALAD + [('arroz_int', 130), ('feijao', 140), ('frango', 90), ('berinjela', 80), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('iogurte_desn', 170), ('aveia', 30)],
            'jantar': [('alface', 30), ('pepino', 40), ('batata_doce', 140), ('sardinha', 100), ('brocolis', 80), ('azeite', 8)],
        },
        'guidelines': [
            'Aveia, feijão, lentilha e frutas todos os dias: a fibra solúvel ajuda a baixar o LDL.',
            'Peixe 2 a 3 vezes por semana; azeite e oleaginosas no lugar de manteiga, banha e frituras.',
            'Evite carnes gordas, embutidos, queijos amarelos, biscoitos recheados e produtos com gordura trans.',
            'Triglicerídeos altos: corte açúcar, doces, refrigerante e bebida alcoólica.',
        ],
    },
    'ta_estruturado': {
        'name': 'Transtornos alimentares — alimentação regular (anorexia e bulimia)',
        'tags': ['transtorno alimentar', 'anorexia', 'bulimia', 'qualitativo'],
        'mode': 'qualitative',
        'protein_per_kg': 1.2, 'lipid_pct': 30,
        'summary': 'Plano qualitativo, sem calorias nem gramas para o paciente: três refeições e três lanches em horários fixos, todos os grupos alimentares e sem alimentos proibidos.',
        'meals': {
            'cafe': [('pao', 50), ('requeijao', 20), ('leite', 200), ('banana', 85)],
            'lanche-manha': [('iogurte', 170), ('aveia', 20)],
            'almoco': SALAD + [('arroz', 150), ('feijao', 120), ('patinho', 100), ('abobrinha', 70), ('azeite', 8), ('laranja', 150)],
            'lanche-tarde': [('pao', 50), ('queijo_minas', 30), ('maca', 130), ('bolo_choc', 40)],
            'jantar': [('macarrao_bolonhesa', 250), ('brocolis', 70), ('azeite', 5)],
            'ceia': [('leite', 200), ('biscoito_maisena', 25)],
        },
        'guidelines': [
            'Coma em todos os horários combinados, mesmo sem fome: a regularidade é a base do tratamento.',
            'Nenhum alimento é proibido. Os alimentos que dão medo entram aos poucos, combinados com o seu nutricionista.',
            'Evite contar calorias, pesar-se em casa e comparar o seu prato com o de outras pessoas.',
            'Depois de comer, fique com alguém ou faça uma atividade tranquila; se vier vontade de compensar, registre e converse na próxima consulta.',
            'O plano faz parte do tratamento com a equipe (psicólogo, psiquiatra e médico). Sinais de alerta (desmaio, palpitação, vômitos frequentes): procure atendimento.',
        ],
    },
    'ta_compulsao': {
        'name': 'Transtornos alimentares — compulsão alimentar',
        'tags': ['transtorno alimentar', 'compulsão alimentar', 'qualitativo'],
        'mode': 'qualitative',
        'protein_per_kg': 1.2, 'lipid_pct': 30,
        'summary': 'Plano qualitativo e sem restrição: refeições regulares para não chegar com muita fome, com proteína, fibra e espaço para alimentos prazerosos.',
        'meals': {
            'cafe': [('pao_int', 50), ('ovo', 50), ('leite', 200), ('mamao', 150)],
            'lanche-manha': [('iogurte', 170), ('banana', 85)],
            'almoco': SALAD + [('arroz', 130), ('feijao', 120), ('frango', 100), ('brocolis', 80), ('azeite', 6), ('laranja', 150)],
            'lanche-tarde': [('pao', 50), ('queijo_minas', 30), ('chocolate', 20), ('maca', 130)],
            'jantar': [('alface', 30), ('tomate', 60), ('arroz', 110), ('feijao', 90), ('patinho', 90), ('abobrinha', 80), ('azeite', 5)],
            'ceia': [('pipoca', 20)],
        },
        'guidelines': [
            'Não pule refeições: ficar muitas horas sem comer aumenta o risco de episódios de compulsão.',
            'Sem dieta restritiva e sem alimentos proibidos; doces e petiscos entram de forma planejada.',
            'Coma sentado, sem telas, prestando atenção ao sabor e aos sinais de fome e saciedade.',
            'Registre como se sentiu antes e depois das refeições e dos episódios, sem julgamento, para conversar na consulta.',
            'O plano faz parte do tratamento com a equipe de saúde mental.',
        ],
    },
})

LEVELS = {
    'tradicional': [1200, 1500, 1800, 2000, 2200, 2500],
    'vegetariano': [1200, 1500, 1800, 2000, 2200, 2500],
    'vegano': [1500, 1800, 2000, 2200, 2500],
    'mediterraneo': [1200, 1500, 1800, 2000, 2200, 2500],
    'dash': [1200, 1500, 1800, 2000, 2200, 2500],
    'glicemico': [1200, 1500, 1800, 2000, 2200],
    'gestante': [2000, 2300, 2600],
    'idoso': [1600, 1800, 2000],
    'escolar': [1400, 1700],
    'hipertrofia': [2200, 2500, 2800, 3200],
    'endurance': [2200, 2500, 2800, 3200],
    'definicao': [1600, 1800, 2000, 2200],
    'lactante': [2300, 2500, 2800],
    'primeira_infancia': [1000, 1200],
    'pre_escolar': [1300, 1500],
    'adolescente': [2000, 2400, 2800],
    'emagrecimento': [1200, 1400, 1600, 1800],
    'gastrite': [1500, 1800, 2000],
    'constipacao': [1500, 1800, 2000],
    'dislipidemia': [1500, 1800, 2000],
    'ta_estruturado': [2200],
    'ta_compulsao': [2000],
}

COMMON_GUIDELINES = [
    'Modelo base da biblioteca Rafanutri: ajuste quantidades, alimentos e horários ao paciente antes de publicar.',
    'As quantidades são do alimento pronto para consumo (cozido, grelhado ou cru, conforme o nome). As substituições de cada item têm a mesma energia.',
]


def per(ref, nutrient):
    return FOODS[ref][1][nutrient]


def rnd(g):
    """Arredonda como o app: de 5 em 5 g (abaixo de 20 g, de 1 em 1 g)."""
    return max(1, round(g)) if g < 20 else int(5 * round(g / 5))


def day_values(meals):
    tot = {k: 0.0 for k in NUTRIENTS}
    for items in meals.values():
        for alias, g in items:
            for k in NUTRIENTS:
                v = per(F[alias], k)
                tot[k] += (v or 0) * g / 100
    return tot


def scaled(pattern, k):
    out = {}
    for meal, items in pattern['meals'].items():
        out[meal] = [(a, rnd(g * k ** CLASS[CLASS_OF[a]])) for a, g in items]
    return out


def solve(pattern, target):
    lo, hi = 0.2, 4.0
    for _ in range(60):
        mid = (lo + hi) / 2
        e = day_values({m: [(a, g * mid ** CLASS[CLASS_OF[a]]) for a, g in it] for m, it in pattern['meals'].items()})['energy_kcal']
        lo, hi = (mid, hi) if e < target else (lo, mid)
    return scaled(pattern, (lo + hi) / 2)


def subs_for(alias, grams):
    kcal = per(F[alias], 'energy_kcal') or 0
    out = []
    for s in SUBS.get(alias, [])[:3]:
        sk = per(F[s], 'energy_kcal')
        if not sk or not kcal:
            continue
        out.append({'foodId': F[s], 'quantityG': rnd(grams * kcal / sk)})
    return out


def build():
    templates = []
    report = []
    for code, p in PATTERNS.items():
        for level in LEVELS[code]:
            meals = solve(p, level)
            tot = day_values(meals)
            e = tot['energy_kcal']
            json_meals = []
            qualitative = p.get('mode') == 'qualitative'
            for mid, items in meals.items():
                name, time = MEAL_INFO[mid]
                time = p.get('times', {}).get(mid, time)
                json_items = []
                for n, (alias, g) in enumerate(items):
                    item = {'key': f'lib-{mid}-{n}', 'foodId': F[alias], 'quantityG': g}
                    subs = subs_for(alias, g)
                    if subs:
                        item['subs'] = subs
                    json_items.append(item)
                json_meals.append({'id': mid, 'name': name, 'time': time, 'items': json_items})
            pct = lambda kcal: round(100 * kcal / e)
            report.append(f"{p['name'][:28]:28} {level:5} → {e:6.0f} kcal | P {pct(tot['protein_g'] * 4):2}% {tot['protein_g']:5.1f} g | C {pct(tot['carbohydrate_g'] * 4):2}% | L {pct(tot['lipid_g'] * 9):2}% | fibra {tot['fiber_g']:4.1f} g | Na {tot['sodium_mg']:5.0f} mg")
            slug = f'{code}-{level}'
            templates.append({
                'id': str(uuid.uuid5(NS, slug)),
                'mode': 'qualitative' if qualitative else 'quantitative',
                'name': p['name'] if qualitative else f"{p['name']} — {thousands(level)} kcal",
                'description': (f"Modelo base — revisar antes de prescrever. {p['summary']} Referência para a equipe: cerca de {thousands(round(e))} kcal; o paciente não vê números."
                                if qualitative else
                                f"Modelo base — revisar antes de prescrever. {p['summary']} Aprox. {thousands(round(e))} kcal, {round(tot['protein_g'])} g de proteína e {round(tot['fiber_g'])} g de fibra por dia."),
                'tags': (['biblioteca'] + p['tags'] + ([] if qualitative else [f'{level} kcal']))[:10],
                'targets': {'formula': 'mifflin', 'activity': 1.55, 'adjustment': 0, 'proteinPerKg': p['protein_per_kg'], 'lipidPct': p['lipid_pct'], 'manualKcal': level},
                'meals': json_meals,
                'guidelines': '\n'.join(f'• {g}' for g in p['guidelines'] + COMMON_GUIDELINES),
                'energy_kcal': None if qualitative else round(e, 1),
            })
    return templates, report


def thousands(n):
    return f'{n:,}'.replace(',', '.')


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    missing = sorted({ref for ref in F.values() if ref not in FOODS or FOODS[ref][1]['energy_kcal'] is None})
    if missing:
        raise SystemExit(f'alimentos sem dado de energia: {missing}')
    templates, report = build()
    lines = [
        '-- Biblioteca de modelos de plano da plataforma. GERADO por build_library.py — não edite à mão.',
        '-- Requer a TACO e a base do IBGE importadas. Idempotente (ids estáveis); modelos retirados da biblioteca são apagados.',
        '-- Uso: psql -v ON_ERROR_STOP=1 -f library.sql',
        '',
        'begin;',
        '',
        "create temp table lib_refs on commit drop as",
        "  select s.code || ':' || f.source_code as ref, f.id::text as id",
        "  from foods f join food_sources s on s.id = f.source_id",
        "  where f.organization_id is null and s.code in ('TACO', 'IBGE');",
        '',
        '-- Troca "FONTE:código" pelo id do alimento neste banco (itens e substituições).',
        'create function pg_temp.lib_meals(j jsonb) returns jsonb language sql stable as $$',
        "  select coalesce(jsonb_agg(m.meal || jsonb_build_object('items', (",
        "    select coalesce(jsonb_agg(i.item || jsonb_build_object('foodId', (select id from lib_refs where ref = i.item->>'foodId'))",
        "      || case when i.item ? 'subs' then jsonb_build_object('subs', (",
        "        select coalesce(jsonb_agg(s.sub || jsonb_build_object('foodId', (select id from lib_refs where ref = s.sub->>'foodId')) order by s.n), '[]'::jsonb)",
        "        from jsonb_array_elements(i.item->'subs') with ordinality s(sub, n))) else '{}'::jsonb end order by i.n), '[]'::jsonb)",
        "    from jsonb_array_elements(m.meal->'items') with ordinality i(item, n))) order by m.n), '[]'::jsonb)",
        '  from jsonb_array_elements(j) with ordinality m(meal, n)',
        '$$;',
        '',
    ]
    for t in templates:
        lines.append(
            'insert into meal_plan_templates (id, organization_id, name, description, tags, mode, targets, meals, guidelines, energy_kcal) values ('
            f"{sql_str(t['id'])}, null, {sql_str(t['name'])}, {sql_str(t['description'])}, {sql_str(json.dumps(t['tags'], ensure_ascii=False))}::jsonb, {sql_str(t['mode'])}, "
            f"{sql_str(json.dumps(t['targets']))}::jsonb, pg_temp.lib_meals({sql_str(json.dumps(t['meals'], ensure_ascii=False))}::jsonb), {sql_str(t['guidelines'])}, {'null' if t['energy_kcal'] is None else t['energy_kcal']})\n"
            '  on conflict (id) do update set name = excluded.name, description = excluded.description, tags = excluded.tags, mode = excluded.mode,'
            ' targets = excluded.targets, meals = excluded.meals, guidelines = excluded.guidelines, energy_kcal = excluded.energy_kcal;'
        )
    ids = ', '.join(sql_str(t['id']) for t in templates)
    lines += [
        '',
        f'delete from meal_plan_templates where organization_id is null and id not in ({ids});',
        '',
        '-- Conferência: todos os alimentos foram encontrados neste banco.',
        'do $$',
        'declare n int; bad int;',
        'begin',
        '  select count(*) into n from meal_plan_templates where organization_id is null;',
        "  select count(*) into bad from meal_plan_templates where organization_id is null and (",
        "    jsonb_path_exists(meals, '$[*].items[*] ? (@.foodId == null)') or jsonb_path_exists(meals, '$[*].items[*].subs[*] ? (@.foodId == null)'));",
        f"  if n <> {len(templates)} or bad > 0 then raise exception 'Biblioteca incompleta: % modelos, % com alimento não encontrado', n, bad; end if;",
        "  raise notice 'Biblioteca ok: % modelos de plano', n;",
        'end $$;',
        '',
        'commit;',
        '',
    ]
    with open(os.path.join(ROOT, 'library.sql'), 'w', encoding='utf8') as f:
        f.write('\n'.join(lines))
    print('\n'.join(report))
    print(f'{len(templates)} modelos')


if __name__ == '__main__':
    main()
