# Completa os produtos aproveitados com categorias e porção (API de produto do Open Food Facts, ~90 leituras/min).
# Uso: python3 enrich_off.py <arquivo_com_códigos> <pasta_detalhes>
import json, os, sys, time, urllib.request
codes = [c.strip() for c in open(sys.argv[1]) if c.strip()]
out_dir = sys.argv[2]
FIELDS = 'code,categories_tags,serving_quantity,nutriments,product_name_pt,product_name,brands'
for i, c in enumerate(codes):
    path = f'{out_dir}/{c}.json'
    if os.path.exists(path):
        continue
    for attempt in range(4):
        try:
            req = urllib.request.Request(f'https://world.openfoodfacts.org/api/v2/product/{c}?fields={FIELDS}', headers={'User-Agent': 'Rafanutri/1.0 (nutrition platform import)'})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            json.dump(d.get('product') or {}, open(path, 'w'))
            break
        except Exception as e:
            time.sleep(15 * (attempt + 1))
    if i % 1000 == 0:
        print(i, flush=True)
    time.sleep(0.65)  # ~90 leituras por minuto (limite da API: 100)
print('FIM', flush=True)
