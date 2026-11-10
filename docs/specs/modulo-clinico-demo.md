# Spec — Módulo clínico em demonstração (pacientes, avaliação, plano alimentar e PDF)

- **Status:** implementada em 10/11/2026 como **demonstração** (dados de exemplo, nada é salvo)
- **Relacionado:** [Fase 1](../plano/fase-1-mvp-clinico.md) (RN-020, RN-023, RN-027 a RN-036), [Tela principal](tela-principal-modulos.md), [Benchmark](../pesquisa/benchmark-clinico.md)

## 1. Objetivo

Mostrar e validar com nutricionistas o fluxo central da consulta (paciente → avaliação → metas → plano alimentar → PDF) **antes de existir banco**, usando os cálculos reais do pacote `@rafanutri/nutrition-core`.

## 2. Rotas (exigem login)

| Rota | Tela |
|---|---|
| `/app/pacientes` | Lista de pacientes |
| `/app/pacientes/exemplo` | Ficha resumo da paciente de exemplo (aba "Resumo") |
| `/app/pacientes/exemplo/avaliacao` | Avaliação antropométrica |
| `/app/pacientes/exemplo/plano` | Editor de plano alimentar com PDF |

O card **Clínico** da tela principal tem o botão "Ver demonstração", que leva à lista.

## 3. Dados de exemplo

| Arquivo | Conteúdo |
|---|---|
| `apps/web/lib/demo/patient.ts` | Paciente Marina Costa (32 anos, 165 cm, intolerância à lactose) e 3 avaliações anteriores |
| `apps/web/lib/demo/patients.ts` | 9 pacientes fictícios para a lista (só a Marina tem ficha) |
| `apps/web/lib/demo/foods.ts` | **Base de exemplo** com 29 alimentos, valores aproximados por 100 g, medidas caseiras e o plano inicial |
| `apps/web/lib/demo/practice.ts` | Consultório de exemplo (nome, CRN, cor) e orientações padrão |

**Regra:** a base de exemplo não serve para uso clínico, e a tela diz isso. Um teste confere que a energia de cada alimento é coerente com os macros (regra 4/4/9, com tolerância de 15% ou 8 kcal, porque em hortaliças o carboidrato inclui fibra). A TACO completa entra com o RN-011, quando o banco for liberado.

## 4. Telas

### 4.1 Lista de pacientes
- Busca por nome ou objetivo, ignorando acentos.
- Filtro por status: ativos, inativos e arquivados, com contagem.
- Contador do plano gratuito ("7 de 20 pacientes ativos"), com barra.
- Cada linha mostra a última consulta e o próximo retorno (ou "Sem retorno") e as etiquetas.
- "Novo paciente" desativado (pré-lançamento).

### 4.2 Ficha resumo
- Última avaliação: peso, IMC, % de gordura e a evolução desde a primeira consulta.
- Plano vigente: kcal do dia e por refeição, com link para o editor.
- Próximas consultas (online ou presencial).
- Anamnese resumida (objetivo, restrições, rotina, queixas).
- Linha do tempo.

### 4.3 Avaliação antropométrica
- **Medidas:** peso, altura, cintura e quadril.
- **Protocolos:** Jackson & Pollock 3 e 7, Durnin & Womersley, Faulkner e perfil restrito ISAK (somatórios de 6 e 8 dobras). Os campos de dobras mudam conforme o protocolo. Siri ou Brozek para converter densidade em % de gordura.
- **Resultados ao vivo:**
  - IMC com classificação (OMS; Lipschitz para idosos);
  - variação de peso;
  - % de gordura, massa magra e massa gorda;
  - relação cintura/quadril e cintura/estatura (alerta a partir de 0,5);
  - risco pela circunferência da cintura.
- **Gráficos:** evolução do peso e da % de gordura (SVG próprio, com tabela acessível para leitores de tela).
- "Salvar avaliação" desativado (pré-lançamento).

### 4.4 Editor de plano alimentar
- **Metas:**
  - fórmula (Mifflin-St Jeor, Harris-Benedict ou FAO/OMS);
  - fator de atividade e ajuste em kcal;
  - proteína em g/kg e lipídios em %; o carboidrato fica com o restante;
  - mostra GER, GET e a meta.
- **Refeições:** busca de alimentos (Enter adiciona o primeiro resultado), quantidade em gramas com a medida caseira equivalente, e kcal por item, por refeição e % do dia.
- **Plano × metas:** barras de adequação de energia, proteína, carboidrato, lipídios e fibras.
  - Faixa adequada de 90% a 110%.
  - Fibra é meta mínima: passar dela também conta como adequado.
  - Aviso quando algum alimento não tem dado de fibra.
- **Substituições:** equivalentes em energia do mesmo grupo, ordenados pela menor diferença nos outros macros, com medida caseira e a diferença de proteína. As escolhidas aparecem em "Ou:".
- **Modo qualitativo:** esconde gramas, medidas e calorias; aparece o grupo do alimento.
- "Publicar para a paciente" desativado (pré-lançamento).

### 4.5 PDF do plano alimentar
- Gerado **no navegador** com `@react-pdf/renderer`, a partir do estado atual do editor.
- **Conteúdo:**
  - barra e selo na cor da marca;
  - nome do consultório e nutricionista com CRN;
  - paciente e objetivo;
  - datas de emissão e validade (30 dias);
  - totais (opcionais, pela opção "Mostrar calorias no PDF");
  - refeições com medida caseira e gramas, e a linha "Ou:" com as substituições;
  - orientações;
  - linha de assinatura;
  - "Página X de Y".
- **Modo qualitativo:** o PDF sai sem nenhum número.
- Os dados do PDF são montados por uma função pura (`apps/web/lib/pdf/meal-plan-data.ts`), testada separadamente da renderização.

### 4.6 Plural das medidas caseiras
`apps/web/lib/format/measure.ts`: "1 fatia", "1,5 fatia", "2 fatias", "2 colheres de sopa", "2 conchas médias". O plural começa em 2.

## 5. Testes

- Coerência da base de exemplo, busca sem acento e plano só com alimentos da base.
- Editor: totais contra a meta, modo qualitativo sem números e sugestão de substituições.
- Avaliação: IMC ao vivo (67,6 kg e 165 cm dão 24,8; 80 kg dão 29,4).
- PDF: dados quantitativos e qualitativos, substituições e geração de um arquivo PDF válido (`%PDF-`).
- Plural das medidas.
- Ponta a ponta: as rotas do módulo exigem login.

## 6. Quando o banco for liberado

| Hoje (demonstração) | Depois |
|---|---|
| `lib/demo/*` | Coleções do Directus: `patients`, `anthropometric_assessments`, `energy_calculations`, `meal_plans`, `meals`, `meal_items` |
| Base de exemplo | TACO e TBCA importadas (RN-011, RN-012) e busca pelo endpoint `search_foods` |
| Botões desativados | Salvar avaliação, publicar plano e novo paciente |
| Consultório de exemplo no PDF | Marca vinda do onboarding (nome, cor, logo, CRN) |
