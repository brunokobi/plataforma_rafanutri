# Módulo UAN e Qualidade — plano do módulo

A Rafanutri é uma **plataforma** com vários módulos sobre um núcleo comum. A **UAN** (Unidades de Alimentação e Nutrição) é o módulo das empresas e profissionais que produzem refeições em escala.

Este documento define o módulo: para quem é, o que entrega, como se encaixa na plataforma, onde entra a IA e em que ordem será construído. O detalhamento técnico item a item (SQL, regras de cálculo, tarefas, critérios de aceite e testes) está na [Fase 5](../plano/fase-5-uan-qualidade.md), com IDs RN-120 a RN-169 e RN-220 a RN-239.

> **Revisão de 15/11/2026.** Plano refeito depois de comparar com o TecFood (Teknisa) e o NutriUAN (seção 2) e com a descoberta do BPF Check ([uan-discovery.md](../pesquisa/uan-discovery.md)). O que mudou:
> - novas entregas de **produção e desperdício** e de **custos e indicadores**;
> - **tipos de cardápio** por serviço e por público, incluindo dietas hospitalares;
> - uma camada de **IA** em cada entrega, com regras próprias (seção 6);
> - preços revistos contra o mercado.
>
> A U0 (empresa, unidades e equipe) está em produção desde 15/11/2026.

## 1. Visão do módulo

**Problema.** Restaurantes industriais e corporativos, cozinhas hospitalares, escolas, hotéis, catering e a nutricionista que presta consultoria controlam Boas Práticas, temperatura, fichas técnicas, cardápio, compras, estoque e desperdício em papel e planilha. Isso gera três problemas:
- na fiscalização sanitária faltam registros, os POPs estão desatualizados e as não conformidades não têm plano de ação;
- o custo por refeição só aparece no fim do mês, quando já não dá para corrigir;
- o desperdício (sobra e resto) não é medido, então o per capita nunca é ajustado.

**Proposta.** Uma unidade produtora opera **sem papel e sem planilha**, com a IA fazendo o trabalho repetitivo e o nutricionista decidindo:
- o RT monta o cardápio a partir de fichas técnicas com custo, nutrientes e alergênicos. A IA propõe cenários dentro das regras do contrato, e o RT escolhe;
- a quantidade a produzir e a comprar sai do cardápio e da previsão de comensais;
- a equipe registra checklists, temperaturas, sobras e resto no celular, inclusive sem internet;
- o painel compara planejado e realizado (custo, consumo e comensais) no mesmo dia;
- o dossiê para a fiscalização e o relatório mensal para o cliente ou a diretoria saem prontos.

**Base legal principal:**
- ANVISA RDC 216/2004 (Boas Práticas em serviços de alimentação) e RDC 275/2002 (lista de verificação), complementadas por normas estaduais e municipais;
- PAT: Portaria MTE nº 66/2006, **a validar** a norma vigente;
- PNAE: Resolução CD/FNDE nº 06/2020, **a validar**;
- rotulagem: RDC 429/2020, IN 75/2020 e RDC 26/2015 (alergênicos).

## 2. Mercado e posicionamento

Levantamento de 15/11/2026 nas páginas públicas dos produtos.

| | TecFood (Teknisa) | NutriUAN | Rafanutri UAN |
|---|---|---|---|
| **Para quem** | Redes e grandes operadoras (corporativo, escolar, hospitalar, aéreo, offshore, setor público) | Nutricionista consultora (até 5 unidades) e nutricionista de UAN; redes no plano Empresas | Nutricionista consultora, UAN independente e redes médias. A mesma conta atende o consultório clínico |
| **Abrangência** | ERP completo: cardápio, custos e DRO, produção, estoque, faturamento de contratos, NF-e, dietas hospitalares integradas ao prontuário do hospital, reconhecimento facial de comensais | Cardápio com ficha técnica, estoque, desperdício (sobra e resto com custo), metas e CMV, checklists, APPCC, POPs, plano de ação, escalas | BPF no celular, ficha técnica, cardápio por tipo de público, produção e desperdício, compras e estoque, custos planejado × realizado, documentos e fiscalização |
| **IA** | "Cardápio Inteligente": cenários a partir das restrições do contrato, nota de 0 a 100 com problemas por criticidade, e a nutricionista aprova | Não menciona | Em todas as entregas, com o nutricionista decidindo (seção 6) |
| **Implantação** | Consultiva, com cronograma | Self-service, "no mesmo dia" | Self-service, com importação assistida no piloto |
| **Preço** | Sob consulta | Starter R$ 97 (1 unidade), Pro R$ 149 (até 3 unidades), Empresas sob consulta | Seção 8 |

**O que aprendemos e entra no plano:**
- **TecFood:**
  - **Cardápio por serviço e por público:** desjejum, almoço, jantar, dieta e lanche; escolar por tipo de ensino; hospitalar ligado à prescrição.
  - **Receita padrão da rede com ajuste local**, sem mexer na ficha da rede.
  - **Regras de contrato no cardápio:** produtos vetados, grupos obrigatórios por dia e frequência máxima de cada prato.
  - **Planejado × realizado:** custo per capita, consumo produto a produto e efetivos, comparados no mesmo dia.
  - **Sobra limpa e resto-ingesta com motivo**, usados para ajustar o per capita da semana seguinte.
  - **Adesão por prato** e pesquisa de satisfação por QR Code.
  - **Alergênicos destacados** no cardápio publicado e na ficha.
  - **Cardápio publicado** para o comensal por link, QR Code ou TV.
  - **Fluxo de aprovação** do cardápio, com a compra liberada só depois da aprovação.
  - **Inventário cego** e motivo obrigatório na baixa (consumo, perda ou desperdício).
  - **Coleta em campo sem internet.**
- **NutriUAN:**
  - **O mercado de consultoras e UAN pequena paga R$ 97 a R$ 149 por mês.** Abaixo disso o produto vira commodity; acima, precisa entregar mais (a IA e o clínico integrado).
  - **Relatório executivo para cliente ou diretoria com um clique** é o que a consultora mostra para manter o contrato.
  - **Metas de CMV e ticket médio** em linguagem de dono de restaurante, além da linguagem de nutricionista.

**Fora do escopo do módulo:** emissão de NF-e, faturamento de contratos, DRO e orçamento operacional completos, reconhecimento facial, catering aéreo e offshore, integração com prontuário hospitalar (HL7/FHIR) e sensores IoT. Esses itens ficam para avaliar por demanda de cliente. Importar o XML da NF-e no recebimento está **dentro** do escopo, porque é só leitura.

**Posicionamento.** O TecFood é um ERP para quem fatura contrato de alimentação. O NutriUAN é uma planilha bem feita para a nutricionista. A Rafanutri fica entre os dois:
- tem a profundidade técnica de nutrição do TecFood (ficha técnica calculada, tipos de cardápio, desperdício e planejado × realizado);
- tem o preço e a adoção do NutriUAN;
- tem dois diferenciais que nenhum dos dois oferece:
  - **IA que trabalha junto com o RT** em todas as etapas;
  - **um só produto para a nutricionista** que atende consultório e presta consultoria a cozinhas.

## 3. Personas e papéis

| Persona | Papel na plataforma | O que faz no módulo | Onde usa |
|---|---|---|---|
| Nutricionista RT | `technical_lead` | Fichas técnicas, cardápio, aprova documentos e cardápios, trata não conformidades, analisa desperdício, responde à fiscalização | Computador |
| Nutricionista consultora | `owner` de uma organização com várias unidades de clientes | O mesmo que o RT, em várias empresas atendidas, com relatório para cada cliente | Computador e celular |
| Gestor da empresa | `owner` (organização) ou `manager` (unidade) | Custos, metas, conformidade e desperdício de todas as unidades; contrata o módulo | Computador |
| Cozinheiro / manipulador | `cook` | Checklists, temperaturas, lista de preparo do dia, pesagem de sobra e resto, consulta de fichas | Celular, inclusive sem internet |
| Estoquista / comprador | `stock_keeper` | Pedidos, recebimento, estoque, inventário | Celular e computador |
| Auditor / consultor externo | `auditor` | Lê tudo da unidade sem alterar; gera relatórios | Computador |
| Comensal | Sem conta | Vê o cardápio do dia (alergênicos e nutrientes) e responde à pesquisa de satisfação | Link, QR Code ou TV |

Os papéis valem **por unidade produtora** (RN-121 e RN-122, em produção). A equipe da UAN fica em `unit_members` e **nunca** em `organization_members`, então cozinheiros e estoquistas não alcançam o módulo clínico nem o financeiro.

## 4. Como o módulo se encaixa na plataforma

### O que reaproveita do núcleo

| Do núcleo / outros módulos | Uso na UAN |
|---|---|
| Organizações, membros, isolamento e auditoria (Fase 0, RN-009) | Empresa = organização; isolamento por organização e por unidade (0033); trilha de auditoria nas tabelas da UAN |
| Base TACO/TBCA e `nutrition-core` (Fases 0 e 1) | Nutrientes das fichas técnicas e dos cardápios |
| Receitas e preparações (RN-042, RN-206) | Ponto de partida da ficha técnica: a receita do consultório vira ficha com custo e rendimento industrial |
| Gerador de PDF com marca (RN-036) | Ficha técnica, cardápio, relatórios e dossiê |
| Área do paciente mobile (RN-204) | Mesma base para as telas de chão de fábrica (alvos grandes, uma mão, sem rolagem lateral) |
| Página pública (RN-068) | Cardápio publicado para o comensal |
| `packages/ai` (Fase 3, RN-082/083) | Camada única de acesso ao LLM, saída validada por Zod, cotas e registro em `ai_suggestions` |
| RAG (Fase 6, RN-180 a RN-183) | Assistente de Boas Práticas com citação da norma |
| n8n e WhatsApp (Fase 2) | Alertas de temperatura, checklist atrasado, validade e desvio de custo |
| Planos e assinatura (RN-057) | Contratação por unidade |

### Ativação do módulo

- **Em produção desde 15/11/2026:** `organizations.modules`, com `{clinical,uan}` para habilitar, e `organization_contracts`, que limita as unidades ativas. Até existir a cobrança Enterprise, o admin habilita por SQL ([db/README](../../db/README.md#módulo-uan-unidades-e-equipe-rn-121-a-rn-123)).
- Recursos por contrato em `organization_contracts.features` (ex.: `{"ai": true, "hospital": false}`).

### Navegação

O atalho **UAN e Qualidade** aparece na página inicial quando o módulo está habilitado (`/app/uan`). Dentro da unidade:

- **Hoje:** o que a equipe faz agora (checklists, temperaturas, lista de preparo, pesagens).
- **Qualidade:** checklists, temperaturas e não conformidades.
- **Fichas técnicas.**
- **Cardápios.**
- **Produção e desperdício.**
- **Compras e estoque.**
- **Custos e indicadores.**
- **Documentos:** POPs, Manual de Boas Práticas e treinamentos.
- **Relatórios.**

## 5. Entregas do módulo

A ordem prioriza **o que vende sozinho e é rápido de adotar**:

1. **BPF** é a maior dor (multa e interdição). O cozinheiro só precisa do celular, e o modelo RDC 216 já está pronto (BPF Check).
2. **Ficha técnica e cardápio** são o centro do trabalho do RT e a base de tudo que vem depois.
3. **Produção, comensais e desperdício** trazem economia visível no primeiro mês.
4. **Compras e estoque.**
5. **Custos e indicadores.**

Segmentos especiais (hospitalar, escolar) e APPCC/rotulagem entram por demanda.

| Entrega | Nome | O que o cliente passa a fazer | Itens | IA da entrega | Status |
|---|---|---|---|---|---|
| **U0** | Empresa, unidades e equipe | Unidades com alvará e localização; equipe por papel, convidada por link | RN-120 a RN-123, **RN-220** | — | ✅ em produção (convite da equipe por link em 15/11/2026) |
| **U1** | **Qualidade BPF (MVP vendável)** | Checklists no celular (foto, assinatura, offline), temperaturas com alerta, não conformidades com 5W2H, painel de conformidade | RN-146 a RN-154, RN-165 | **RN-230** plano de ação sugerido para a não conformidade | Próxima |
| **U2** | Ficha técnica e cardápio | Insumos, fornecedores e preços; fichas com FC, IC, rendimento, custo, nutrientes e alergênicos; cardápio cíclico por serviço e por público, com regras de contrato, aprovação e publicação para o comensal | RN-125 a RN-136, **RN-221 a RN-224** | **RN-231** cenários de cardápio; **RN-232** ingrediente → TACO e FC/IC de referência | |
| **U3** | Produção, comensais e desperdício | Previsão e registro de comensais, lista de preparo do dia, pesagem de sobra limpa e resto-ingesta com motivo, adesão por prato, per capita ajustado | RN-137, **RN-225 a RN-227** | **RN-233** previsão de comensais; **RN-234** ajuste de per capita; **RN-235** causas do desperdício | |
| **U4** | Compras e estoque | Necessidade de compra calculada, pedido, recebimento com XML da NF-e, lotes e validade (FEFO), inventário cego, motivo na baixa, alertas | RN-139 a RN-145, **RN-228** | **RN-236** leitura de etiqueta e nota por foto (pesquisa) | |
| **U5** | Custos e indicadores | Custo per capita planejado × realizado, consumo por produto, curva ABC, CMV, metas por refeição com trava, painel da unidade e da rede, relatório mensal para o cliente | RN-138, **RN-229** | **RN-237** relatório executivo em linguagem natural | |
| **U6** | Documentação BPF e fiscalização | POPs e Manual de Boas Práticas com versão e aprovação, treinamentos, dossiê, trilha de auditoria | RN-155 a RN-159, RN-166, RN-167 | **RN-238** rascunho de POP e MBP; assistente de BPF com citação da norma (RAG, RN-180 a RN-183) | |
| **U7** | Comercial e piloto | Contrato por unidade, cobrança, onboarding com importação de planilhas, piloto acompanhado | RN-124, RN-168, RN-169 | **RN-239** importação assistida de fichas e insumos de planilha | |
| **U8** | Segmentos: hospitalar e escolar | Hospitalar: mapa de dietas por ala e leito, prescrição dietética ligada ao cardápio, etiquetas, restrição tratada como bloqueio. Escolar: PNAE por modalidade e faixa etária, relatório de prestação de contas | Novos itens, a detalhar com o cliente | Substituições por restrição (regra determinística, não LLM) | Por demanda |
| **U9** | APPCC e rotulagem | Análise de perigos, PCC e monitoramento; tabela nutricional e rótulo frontal | RN-160 a RN-164 | Sugestão de perigos por etapa, revisada pelo RT | Por demanda |

### MVP do módulo = U0 + U1 (+ RN-220)

Vendável para qualquer serviço de alimentação, porque resolve a exigência de registros da RDC 216:
- empresa, unidades e equipe convidada por link;
- biblioteca de checklists padrão: RDC 216 (vindo do BPF Check), higiene de manipuladores, recebimento, temperatura de equipamentos, higienização de ambientes, controle de pragas e potabilidade da água, todos editáveis;
- execução no celular com foto, assinatura, geolocalização e funcionamento sem internet;
- agenda de checklists e cobrança dos atrasados (WhatsApp ou e-mail, quando o n8n e o Resend estiverem no ar; antes disso, aviso no painel);
- equipamentos com faixas de temperatura e alerta ao RT;
- não conformidades com plano de ação 5W2H sugerido pela IA;
- painel de conformidade por unidade e período.

### Produto "Consultora" = U0 + U1 + U2 + U3 + relatório da U5

Compete com o NutriUAN no preço e ganha na IA e no clínico integrado. Inclui:
- várias empresas atendidas na mesma conta;
- relatório mensal por cliente.

### Versão completa = U0 a U7

Uma unidade operando cardápio → produção → compras → recebimento → estoque → checklists → custos → dossiê, sem planilha. É o critério de pronto da Fase 5. U8 e U9 entram conforme os clientes pedirem.

### Tipos de cardápio (RN-221)

O cardápio tem **serviços** e **perfis de público**. As metas nutricionais, as regras e os relatórios vêm do perfil.

| Dimensão | Valores |
|---|---|
| Serviços | Desjejum, colação, almoço, lanche, jantar, ceia, coffee break e outros cadastráveis, cada um com os próprios tipos de prato (prato principal, opção, guarnição, arroz, feijão, salada, sobremesa, suco) |
| Perfis de público | Corporativo e industrial (PAT), escolar (PNAE, por modalidade de ensino e faixa etária), hospitalar (dieta geral, branda, pastosa, líquida e especiais: hipossódica, para diabetes, hipolipídica, sem lactose, sem glúten), hotelaria e eventos (com pré-custo por pessoa), cozinha central e refeição transportada |
| Modelos de autonomia | **Padronizado** (a rede define e as unidades seguem), **descentralizado** (a rede define e a unidade ajusta per capita e composição, sem alterar a ficha da rede) e **livre** (a unidade monta) |
| Regras de contrato | Produtos vetados, grupos obrigatórios por dia, frequência máxima por prato, teto de custo por refeição, metas nutricionais do perfil |

### Desperdício (RN-226): o que se mede

Fórmulas usuais da literatura de gestão de UAN. As faixas de referência são configuráveis, com padrão **a validar** com o RT do piloto.

```
Distribuído (kg)            = Produzido − Sobra limpa
% Sobra limpa               = Sobra limpa / Produzido × 100
% Resto-ingesta             = Resto / Distribuído × 100
Per capita de resto (g)     = Resto / Comensais
Índice de aceitação (%)     = 100 − % Resto-ingesta
Custo do desperdício (R$)   = (Sobra limpa + Resto) × custo por kg da preparação
FC real                     = Peso bruto / Peso líquido medidos no pré-preparo, comparado ao FC da ficha
```

- **Registro por serviço e por preparação**, com motivo classificado (sabor, temperatura, porção grande, apresentação, cardápio repetido, excesso de produção, outro).
- **Pesagem no celular**, com a balança da cozinha, sem integração.
- **Faixas de alerta:** a literatura costuma citar até 10% de resto-ingesta em coletividades sadias e valores maiores em hospitais. Fica **a validar** por perfil de público.

## 6. IA no módulo

A IA entra **onde há trabalho repetitivo ou análise de muitos registros**. Nunca entra onde um número precisa estar certo. Ela segue as regras que a plataforma já definiu para o clínico (Fase 3), adaptadas à UAN:

1. **A IA sugere e o RT decide.** Nada que a IA gera é publicado, comprado ou enviado sem aprovação de um humano com papel na unidade. A tela mostra sempre o que é sugestão.
2. **Números vêm do motor determinístico, nunca do LLM.** Custo, nutrientes, per capita, rendimento, necessidade de compra e indicadores são calculados pelo `nutrition-core` (módulo `uan`). O LLM escolhe, ordena, explica e redige, mas não calcula.
3. **Só itens da base da organização.** As sugestões referenciam fichas, insumos e alimentos por id, e o servidor rejeita qualquer id fora da base. A saída é estruturada e validada por Zod (RN-083).
4. **Previsão é estatística, não LLM.** A previsão de comensais (RN-233) usa um modelo explicável: média por dia da semana, tendência, feriados e eventos, e mostra o porquê do número.
5. **Dados.** Os dados de UAN são quase todos operacionais, sem dado pessoal. No hospitalar (U8) a prescrição dietética é dado de saúde: passa pela pseudonimização (RN-081) e só sai do servidor se o contrato permitir (`features.ai`).
6. **Registro, cota e custo.** Cada chamada vai para `ai_suggestions` com entrada, saída, versão do prompt, modelo, custo e se foi aceita. Há cota por plano (RN-077).
7. **Avaliação antes de liberar.** Cada tarefa de IA tem um conjunto de casos de teste versionado em `packages/ai/evals/uan/`, com meta de qualidade definida antes do lançamento. Visão computacional (fotos) só sai da fase de pesquisa com acurácia medida.

| Item | O que faz | Como | Entrada | Saída | Risco e controle |
|---|---|---|---|---|---|
| **RN-230** Plano de ação para não conformidade (U1) | Ao abrir uma NC, sugere o 5W2H (o quê, por quê, onde, quando, quem, como, quanto) e a causa provável | LLM com o item do checklist, a referência da RDC, a observação e a foto (descrição); RAG da norma quando a Fase 6 existir | NC + item + histórico de NCs parecidas | 5W2H editável e citação do item da norma | O RT edita antes de salvar; nunca fecha a NC sozinho |
| **RN-231** Cenários de cardápio (U2) | Gera de 3 a 5 cenários de ciclo dentro das regras do contrato e do teto de custo, com nota de 0 a 100 e problemas por criticidade (repetição, monotonia de cor e cocção, custo acima do teto, nutriente fora da meta, alergênico em dia proibido) | **Motor de restrições determinístico** monta e pontua; o LLM só propõe trocas para melhorar a nota e explica cada cenário em português | Fichas aprovadas, regras, metas do perfil, histórico de adesão e satisfação | Cenários com nota e lista de problemas; o RT aprova, edita ou descarta | A nota e os números vêm do motor; o cenário entra como rascunho |
| **RN-232** Ingrediente → TACO e FC/IC (U2) | Ao cadastrar um insumo ("contrafilé limpo kg"), sugere o alimento da TACO/TBCA, o FC e o IC de referência e os alergênicos | Busca textual + LLM para desempatar entre candidatos da base; FC e IC de uma tabela de referência (não do LLM) | Nome e categoria do insumo | Alimento sugerido com confiança, FC/IC da tabela, alergênicos prováveis | O RT confirma; sem confirmação, o insumo fica "sem vínculo nutricional" |
| **RN-233** Previsão de comensais (U3) | Prevê comensais por dia e serviço para as próximas semanas | Modelo estatístico explicável (dia da semana, tendência, feriados, eventos, sazonalidade escolar) | Histórico de efetivos, calendário e eventos | Previsão com intervalo e explicação ("segundas têm 8% menos") | O gestor ajusta; o erro da previsão é medido e mostrado |
| **RN-234** Ajuste de per capita (U3) | Sugere novo per capita por preparação quando a sobra ou o resto ficam acima da faixa por várias semanas | **Regra determinística** sobre o histórico de produzido, sobra, resto e adesão; o LLM só redige a justificativa | Pesagens das últimas semanas | "Arroz: per capita de 120 g para 105 g; economia estimada de R$ 340/mês" | O RT aplica na ficha da unidade (o padrão da rede não muda) |
| **RN-235** Causas do desperdício (U3) | Relatório semanal: preparações mais rejeitadas, motivos, dias e serviços críticos, custo e ações sugeridas | Indicadores calculados pelo motor; o LLM agrupa os motivos e redige o resumo e as ações | Pesagens, motivos, satisfação e cardápio | Relatório com números conferíveis e 3 a 5 ações | As ações sugeridas podem virar plano de ação com um clique |
| **RN-236** Etiqueta e nota por foto (U4, pesquisa) | No recebimento, lê lote, validade e temperatura da etiqueta, e itens da nota sem XML | Visão do LLM com saída estruturada | Foto | Campos preenchidos para conferência | Só após medir a acurácia em fotos reais do piloto; sempre conferido pelo estoquista |
| **RN-237** Relatório executivo (U5) | Relatório mensal para o cliente ou a diretoria: custo × meta, desperdício, conformidade, destaques e riscos | Indicadores do motor; o LLM redige o texto | Indicadores do mês e do mês anterior | PDF com marca, editável antes de enviar | Cada número do texto vem do motor (o texto cita a fonte) |
| **RN-238** Rascunho de POP e MBP (U6) | Gera o rascunho dos 4 POPs e do Manual de Boas Práticas a partir de um questionário sobre o estabelecimento | LLM + modelos-base revisados por nutricionista + RAG da RDC 216 | Respostas do questionário (equipamentos, água, pragas, equipe) | Documento em rascunho, com as seções exigidas pela RDC | Só vira versão vigente com aprovação e assinatura do RT |
| **RN-239** Importação assistida (U7) | Lê planilhas de fichas técnicas, insumos e cardápios em formatos variados e mapeia para o modelo da Rafanutri | LLM mapeia as colunas; o motor valida e recalcula | Planilha do cliente | Prévia com erros apontados linha a linha | Nada é gravado sem a prévia aprovada |

**Fora do plano por enquanto (pesquisa):** estimar o resto por foto da bandeja; IA que monta o cardápio sozinha sem o motor de restrições; chat livre sobre os dados da unidade sem citação. São promessas difíceis de garantir e com risco de número errado.

## 7. Reaproveitamento do BPF Check

Feito em 15/11/2026 (RN-120): ver [uan-discovery.md](../pesquisa/uan-discovery.md).
- O modelo **RDC 216/2004** (10 seções, 58 itens) vira modelo padrão da U1, com três correções de texto.
- As ideias técnicas que ficam são o id gerado no aparelho (offline e idempotente) e as três respostas com observação e foto.
- Não há dados para migrar: 1 usuário, parado desde março.

## 8. Modelo comercial do módulo

Preços revistos contra o NutriUAN (R$ 97 a R$ 149 por mês) e o TecFood (sob consulta). Todos **a validar** nas entrevistas do piloto.

| Plano | Para quem | Referência de preço | Inclui |
|---|---|---|---|
| UAN Qualidade | Restaurante ou cozinha que só precisa da BPF | R$ 79 a R$ 99/mês por unidade | U0 + U1 |
| UAN Consultora | Nutricionista que atende vários estabelecimentos | R$ 149 a R$ 199/mês, até 5 unidades de clientes (unidade extra a definir) | U0 a U3 + relatório mensal da U5, IA com cota |
| UAN Completo | Cozinha industrial, hospital, escola, rede média | R$ 249 a R$ 499/mês por unidade, com desconto por volume | U0 a U7, IA com cota maior |
| Rede | Operadoras e redes grandes | Sob consulta | Tudo, mais segmentos (U8/U9) e implantação assistida |

- **A IA é o argumento para cobrar acima do NutriUAN.** A cota de IA por plano protege a margem (o custo por chamada é monitorado, RN-077).
- O plano Consultora é a ponte com o módulo clínico: a nutricionista que já usa o plano gratuito no consultório liga a UAN na mesma conta.

## 9. Quando construir

A U0 foi antecipada em 15/11/2026, enquanto a Fase 2 espera credenciais externas (Resend, n8n, gateway). A sequência a partir daqui:

| Cenário | Próximos passos |
|---|---|
| Sem cliente UAN confirmado (atual) | RN-220 (convite da equipe) → U1 (BPF), intercalando com a Fase 2 quando as credenciais chegarem |
| Cliente piloto confirmado | U1 completa e RN-230, depois U2 e U3 na ordem que o piloto pedir (cardápio ou desperdício primeiro) |
| Interesse forte de consultoras | Priorizar o produto "Consultora" (U2, U3 e o relatório da U5) depois da U1 |

A IA de cada entrega vem **depois** da parte determinística da mesma entrega. Ela depende de `packages/ai` (RN-082/083) e do registro e cotas de sugestões (RN-077), que passam a ser pré-requisitos da U1 em diante.

## 10. Métricas do módulo

| Métrica | Meta inicial |
|---|---|
| Checklists executados no prazo | > 90% |
| Tempo entre leitura de temperatura fora da faixa e ação registrada | < 30 min |
| Não conformidades fechadas no prazo do plano de ação | > 80% |
| Fichas técnicas com custo atualizado nos últimos 30 dias (U2) | > 70% |
| Diferença entre per capita planejado e consumo real (U3/U5) | < 10% |
| Redução do custo do desperdício nos 3 primeiros meses (U3) | > 15% |
| Erro médio da previsão de comensais (U3) | < 10% |
| Diferença entre compra prevista pelo cardápio e compra real (U4) | < 10% |
| Sugestões de IA aceitas sem grande edição | > 50% (abaixo disso, rever o prompt ou a regra) |
| Unidades ativas por cliente | Crescer após o piloto |

## 11. Riscos do módulo

| Risco | Mitigação |
|---|---|
| Normas locais diferentes por município | Biblioteca de checklists editável; levantamento das normas de cada piloto |
| Internet ruim na cozinha | Modo offline dos checklists e das pesagens, com sincronização idempotente (RN-149) |
| Baixa adesão da equipe operacional | Tela "Hoje" com o que fazer agora, telas grandes, cobrança automática |
| Registro "maquiado" (preenchido depois) | Hora do servidor, foto e geolocalização em itens críticos, trilha de auditoria (RN-167) |
| IA com número errado ou sugestão inadequada | Números só do motor; sugestão sempre em rascunho; avaliação com casos antes de liberar; taxa de aceitação monitorada |
| Custo de IA acima do preço do plano | Cotas por plano, modelo menor nas tarefas simples, cache das sugestões |
| Concorrência barata (NutriUAN) e completa (TecFood) | Posicionamento na IA e no clínico integrado; preço de entrada competitivo na UAN Qualidade |
| Escopo grande | Entregas independentes; vender a U1 antes de construir o resto; U8/U9 só com cliente |
| VPS gratuita com dados de empresas | Revisar a infraestrutura (ADR 0004) antes do primeiro contrato pago |
