"""Gera src/who-data.ts com os parâmetros LMS da OMS.

Fontes (dados de referência da OMS, publicados nos repositórios oficiais da OMS):
  WHO Child Growth Standards (2006), 0 a 5 anos — github.com/WorldHealthOrganization/anthro, data-raw/growthstandards:
    weianthro (peso/idade), lenanthro (comprimento-estatura/idade), bmianthro (IMC/idade), hcanthro (perímetro cefálico/idade),
    wflanthro (peso/comprimento), wfhanthro (peso/estatura). Idade em dias (0 a 1856).
  WHO Reference 2007, 5 a 19 anos — github.com/WorldHealthOrganization/anthroplus, data-raw/growthstandards:
    bfawho2007 (IMC/idade), hfawho2007 (estatura/idade), wfawho2007 (peso/idade, até 10 anos). Idade em meses.
Uso: python3 scripts/build_who_data.py <pasta_com_os_txt> src/who-data.ts
"""
import sys

FILES = {
    'wfa': ('weianthro', 'age'), 'lhfa': ('lenanthro', 'age'), 'bfa': ('bmianthro', 'age'), 'hcfa': ('hcanthro', 'age'),
    'wfl': ('wflanthro', 'length'), 'wfh': ('wfhanthro', 'height'),
    'bfa2007': ('bfawho2007', 'age'), 'hfa2007': ('hfawho2007', 'age'), 'wfa2007': ('wfawho2007', 'age'),
}


def main(src, out):
    parts = ['// GERADO por scripts/build_who_data.py — não edite à mão. Parâmetros LMS da OMS (ver o script para as fontes).',
             '/** [início, passo, L, M, S, L, M, S, ...] por sexo (1 = masculino, 2 = feminino). */',
             'export type LmsSeries = { start: number; step: number; lms: number[] };',
             'export const WHO_LMS: Record<string, Record<1 | 2, LmsSeries>> = {']
    for key, (name, col) in FILES.items():
        rows = {1: [], 2: []}
        with open(f'{src}/{name}.txt') as f:
            header = f.readline().split()
            ix = {h: i for i, h in enumerate(header)}
            for line in f:
                v = line.split()
                if not v:
                    continue
                rows[int(v[ix['sex']])].append((float(v[ix[col]]), float(v[ix['l']]), float(v[ix['m']]), float(v[ix['s']])))
        parts.append(f'  {key}: {{')
        for sex in (1, 2):
            r = sorted(rows[sex])
            start, step = r[0][0], round(r[1][0] - r[0][0], 4)
            for a, b in zip(r, r[1:]):
                assert abs((b[0] - a[0]) - step) < 1e-6, (key, sex, a[0], b[0])
            flat = ','.join(f'{l:g},{m:g},{s:g}' for _, l, m, s in r)
            parts.append(f'    {sex}: {{ start: {start:g}, step: {step:g}, lms: [{flat}] }},')
        parts.append('  },')
    parts.append('};\n')
    open(out, 'w').write('\n'.join(parts))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
