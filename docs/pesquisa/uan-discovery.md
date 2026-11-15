# UAN — descoberta e reaproveitamento do BPF Check (RN-120)

Levantamento feito em **15/11/2026** direto na vpsrafa (`~/apps/bpfcheck-api` e banco `bpfcheck-postgres`), só leitura e só números agregados, sem dados de usuários. Responde às perguntas da seção 5 do [plano do módulo](../modulos/uan.md#5-reaproveitamento-do-bpf-check).

## O que existe

- **API:** FastAPI (Python), cerca de 560 linhas, com Postgres próprio (migrado do Supabase).
  - Login próprio com papéis `admin` e `user`.
  - Checklists em seções e itens.
  - "Locais auditados" por usuário.
  - Auditorias com id gerado no aparelho, para funcionar offline.
  - Respostas `conforme`, `nao_conforme` e `nao_aplicavel` com observação.
  - Fotos com id também gerado no aparelho, então reenviar a mesma foto não duplica.
- **Uso real:**
  - 1 usuário.
  - 13 auditorias, das quais 2 foram concluídas.
  - A última é de 22/03/2026, e não houve nenhuma nos últimos 90 dias.
- **Biblioteca:** um único modelo padrão, **"RDC 216/2004 — Checklist oficial de Boas Práticas de Fabricação"**, com 10 seções e 58 itens:

| # | Seção | Itens |
|---|---|---|
| 1 | Edificação, instalações, equipamentos, móveis e utensílios | 16 |
| 2 | Abastecimento de água | 3 |
| 3 | Esgotamento sanitário e resíduos sólidos | 3 |
| 4 | Manipulação de alimentos | 13 |
| 5 | Higienização das instalações, equipamentos, móveis e utensílios | 4 |
| 6 | Controle integrado de vetores e pragas urbanas | 3 |
| 7 | Manipuladores | 6 |
| 8 | Responsável pelas atividades de manipulação | 2 |
| 9 | Documentação e registro | 5 |
| 10 | Controle de qualidade (alimentos) | 3 |

## Respostas às perguntas do plano

| Pergunta | Resposta | Decisão |
|---|---|---|
| Quais modelos de checklist já foram validados com usuários reais? | Só o RDC 216 (58 itens). O uso foi baixo: 2 auditorias concluídas. | Importar como **modelo padrão da plataforma** na U1 (RN-147), com três correções de texto: aspas soltas no item 2.2, "A dessalgue" e "A descongelamento". A nutricionista RT revisa antes do piloto. Os outros modelos do plano (higiene de manipuladores, recebimento, temperatura, higienização, pragas, água) **não existem** e precisam ser escritos. |
| O fluxo mobile funciona no chão de fábrica? | Não há uso suficiente para concluir. | Reaproveitar as **ideias técnicas**: id gerado no aparelho (offline e idempotente), três respostas com observação e foto por item. As telas são feitas de novo na Rafanutri, no padrão mobile da área do paciente (RN-204). |
| O workflow multiagente do n8n é útil? | Não avaliado (n8n ainda não está ligado à Rafanutri). | Fica para a Fase 6 (RAG, RN-180 a RN-183). |
| Há usuários e dados ativos? | 1 usuário, parado desde março. | **Não migrar dados.** O BPF Check pode ser desligado quando a U1 estiver no ar (decisão do dev). |

## Diferenças de arquitetura

Nenhuma diferença pede ADR novo: a UAN segue o padrão da Rafanutri (Directus + extensão `rafanutri`, isolamento por organização).

- No BPF Check o "local auditado" pertence ao usuário. Na Rafanutri ele vira a **unidade produtora** (`production_units`), que pertence à organização, com papéis por unidade.
- O modelo de checklist do BPF Check é global. Na Rafanutri ele vira **modelo da plataforma** (só leitura e duplicável) ou **modelo da organização**, o mesmo padrão dos questionários de anamnese (RN-025).
