"""Gera db/seed/taco/taco-4ed.csv a partir da TACO 4ª edição (NEPA/UNICAMP, 2011).

Entradas (baixar para uma pasta fora do repositório):
  - original.xls  -> planilha oficial "Taco_4a_edicao_2011.xls"
  - food.csv, categories.csv, nutrients.csv, fatty-acids.csv
    -> CSVs do projeto raulfdm/taco-api (MIT), pasta references/csv

Os CSVs trazem os valores já arredondados como na publicação, mas perdem a diferença
entre "Tr" (traço) e "NA" (não analisado). A planilha oficial tem essa marcação.
Este script usa o número do CSV e a marcação da planilha:
  - "Tr" na planilha       -> célula "Tr" (o importador grava 0 com is_trace = true)
  - "NA", "*" ou vazio     -> célula vazia (o importador grava null)
  - número                 -> número do CSV (confere com a planilha, tolerância de arredondamento)

Uso: python3 build_taco_csv.py <pasta_das_entradas> <saida.csv>   (requer xlrd==2.0.1)
"""

import csv
import sys
from pathlib import Path

import xlrd

# coluna da planilha principal -> (coluna do nutrients.csv, código do nutriente)
MAIN = [
    (2, "moisture", "moisture_pct"),
    (3, "kcal", "energy_kcal"),
    (4, "kJ", "energy_kj"),
    (5, "protein", "protein_g"),
    (6, "lipids", "lipid_g"),
    (7, "cholesterol", "cholesterol_mg"),
    (8, "carbohydrates", "carbohydrate_g"),
    (9, "dietaryFiber", "fiber_g"),
    (10, "ash", "ash_g"),
    (11, "calcium", "calcium_mg"),
    (12, "magnesium", "magnesium_mg"),
    (14, "manganese", "manganese_mg"),
    (15, "phosphorus", "phosphorus_mg"),
    (16, "iron", "iron_mg"),
    (17, "sodium", "sodium_mg"),
    (18, "potassium", "potassium_mg"),
    (19, "copper", "copper_mg"),
    (20, "zinc", "zinc_mg"),
    (21, "retinol", "retinol_mcg"),
    (22, "re", "vitamin_a_re_mcg"),
    (23, "rae", "vitamin_a_rae_mcg"),
    (24, "thiamin", "thiamin_mg"),
    (25, "riboflavin", "riboflavin_mg"),
    (26, "pyridoxine", "pyridoxine_mg"),
    (27, "niacin", "niacin_mg"),
    (28, "vitaminC", "vitamin_c_mg"),
]
FATTY = [
    (2, "saturated", "saturated_fat_g"),
    (3, "monounsaturated", "monounsaturated_fat_g"),
    (4, "polyunsaturated", "polyunsaturated_fat_g"),
]
NUTRIENT_CODES = [c for _, _, c in MAIN + FATTY]


def sheet_rows(sheet):
    """{código do alimento: linha} das linhas cuja 1ª coluna é número."""
    out = {}
    for r in range(sheet.nrows):
        first = sheet.cell_value(r, 0)
        if isinstance(first, float):
            out[int(first)] = sheet.row_values(r)
    return out


def read_csv(path, key):
    with open(path, newline="", encoding="utf-8") as f:
        return {int(row[key]): row for row in csv.DictReader(f)}


def merge(xls_value, csv_value, ctx, problems):
    if isinstance(xls_value, str):
        mark = xls_value.strip().upper()
        if mark == "TR":
            return "Tr"
        if mark in ("", "NA", "*"):
            return ""
        # Erro de digitação na planilha oficial (alimento 373, piridoxina: ",0,02"): número com vírgula.
        try:
            xls_value = float(mark.lstrip(",").replace(",", "."))
        except ValueError:
            problems.append(f"{ctx}: marcação desconhecida {xls_value!r}")
            return ""
    if csv_value in ("", None):
        problems.append(f"{ctx}: planilha tem {xls_value}, CSV vazio")
        return ""
    num = float(csv_value)
    # Tolerância: arredondamento da publicação (inclui x,5 arredondado para cima).
    if abs(num - xls_value) > max(0.051, abs(xls_value) * 0.01) and abs(num - xls_value) > 0.5 + 1e-9:
        problems.append(f"{ctx}: planilha {xls_value:.4f} x CSV {num}")
    return csv_value


def main(src, out):
    src = Path(src)
    book = xlrd.open_workbook(src / "original.xls")
    main_rows = sheet_rows(book.sheet_by_index(0))
    fatty_rows = sheet_rows(book.sheet_by_index(1))
    foods = read_csv(src / "food.csv", "id")
    cats = read_csv(src / "categories.csv", "id")
    nutr = read_csv(src / "nutrients.csv", "foodId")
    fatty = read_csv(src / "fatty-acids.csv", "foodId")

    problems = []
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["taco_code", "name", "food_group", *NUTRIENT_CODES])
        for code in sorted(foods):
            food = foods[code]
            row = main_rows.get(code)
            if row is None:
                problems.append(f"{code}: não está na planilha")
                continue
            values = [merge(row[col], nutr.get(code, {}).get(key, ""), f"{code}/{nc}", problems) for col, key, nc in MAIN]
            frow = fatty_rows.get(code)
            for col, key, nc in FATTY:
                if frow is None:
                    values.append("")
                else:
                    values.append(merge(frow[col], fatty.get(code, {}).get(key, ""), f"{code}/{nc}", problems))
            w.writerow([code, food["name"].strip(), cats[int(food["categoryId"])]["name"].strip(), *values])

    print(f"{len(foods)} alimentos gravados em {out}")
    if problems:
        print(f"{len(problems)} divergências:")
        for p in problems:
            print("  " + p)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
