# Baixa os produtos vendidos no Brasil do Open Food Facts (ODbL). Uso: cd <pasta> && python3 fetch_off.py
import json, os, sys, time, urllib.parse, urllib.request
FIELDS = 'code,product_name,product_name_pt,brands,categories_tags,nutriments,serving_quantity,nutrition_data_per,quantity'
QUERIES = [f'countries_tags:"en:brazil" AND code:789{d}*' for d in range(10)] + ['countries_tags:"en:brazil" AND NOT code:789*']
total = 0
for qi, q in enumerate(QUERIES):
    page = 1
    while True:
        out = f'q{qi}-p{page}.json'
        if os.path.exists(out):
            hits = json.load(open(out))['products']
        else:
            url = 'https://search.openfoodfacts.org/search?' + urllib.parse.urlencode({'q': q, 'page_size': 100, 'page': page, 'fields': FIELDS})
            for attempt in range(5):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Rafanutri/1.0 (nutrition platform import)'})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        d = json.load(r)
                    break
                except Exception as e:
                    print('retry', q, page, e, flush=True); time.sleep(10)
            else:
                print('FALHOU', q, page, flush=True); break
            hits = d.get('hits') or []
            json.dump({'products': hits, 'count': d.get('count')}, open(out, 'w'))
            time.sleep(1)
        total += len(hits)
        if len(hits) < 100 or page >= 100:
            print(f'{q}: {page} paginas, total {total}', flush=True)
            break
        page += 1
print('FIM', total, flush=True)
