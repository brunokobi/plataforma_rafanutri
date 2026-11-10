# Spec — Tela principal com os módulos do usuário (`/app`)

- **Status:** implementada em 10/11/2026 (`/app`). O card Clínico tem o botão "Ver demonstração" ([módulo clínico em demonstração](modulo-clinico-demo.md))
- **Fontes:** [02-modulos.md](../02-modulos.md), [01-visao-produto.md](../01-visao-produto.md) (planos), [Fase 1B](../plano/fase-1b-freemium-area-paciente.md) (plano gratuito, `plans.features`), [Módulo UAN](../modulos/uan.md), [ADR 0008](../adr/0008-backend-directus.md)

## 1. Objetivo

Depois do login, a primeira tela mostra **todos os módulos da plataforma Rafanutri** e deixa claro, para cada um:
- se o usuário **tem acesso** pelo plano dele;
- se o módulo **já está disponível** ou **ainda em construção** (e em qual fase do roadmap);
- o que fazer para ter acesso (qual plano inclui).

Ela também mostra o **plano atual** e uma **comparação dos planos**.

## 2. Módulos

| Código | Módulo | Resumo | Fase do roadmap |
|---|---|---|---|
| `clinical` | Clínico e Esportivo | Pacientes, agenda, anamnese, avaliação, gasto energético, plano alimentar com substituições, PDF | Fase 1 |
| `patient_area` | Área do paciente | Plano publicado, receitas, recomendações e documentos no celular do paciente | Fase 1B |
| `practice` | Gestão do consultório | Lembretes por WhatsApp, financeiro, pacotes, CRM, agendamento online | Fase 2 |
| `ai` | Assistente de IA | Sugestão de plano alimentar, resumo da anamnese, assistente sobre diretrizes | Fase 3 |
| `maternal` | Materno-infantil | Curvas de crescimento da OMS, gestantes, introdução alimentar | Fase 4 |
| `uan` | UAN e Qualidade | Checklists BPF, temperaturas, não conformidades, ficha técnica, cardápio, compras, estoque | Fase 5 |
| `public_health` | Saúde pública | Triagens (NRS-2002, MNA, MUST), programas e indicadores coletivos | Fase 6 |

O núcleo comum (conta, equipe, pacientes, base de alimentos) não aparece como módulo: ele vem junto com qualquer módulo.

## 3. Acesso por plano

Legenda: **✓** incluso · **Cota** incluso com limite · **—** não incluso.

| Módulo | Gratuito | Essencial | Profissional | Clínica | Enterprise UAN |
|---|---|---|---|---|---|
| Clínico e Esportivo | ✓ (até 20 pacientes ativos) | ✓ | ✓ | ✓ | — |
| Área do paciente | ✓ | ✓ | ✓ | ✓ | — |
| Gestão do consultório | — | ✓ (lembretes e agendamento online) | ✓ (completo) | ✓ | — |
| Assistente de IA | Cota (5 por dia) | Cota (5 por dia) | ✓ | ✓ | — |
| Materno-infantil | — | — | ✓ | ✓ | — |
| UAN e Qualidade | — | — | — | — | ✓ |
| Saúde pública | Contrato específico (prefeituras e programas); não é vendido por plano |

**A validar:** a posição do Materno-infantil (Profissional e Clínica) e da cota de IA nos planos pagos é proposta desta spec. A tabela de planos de [01-visao-produto.md](../01-visao-produto.md) não define esses dois pontos. Ajustar quando a precificação for fechada (Fase 2, RN-057).

## 4. Estados de um card de módulo

O estado combina **acesso pelo plano** com **disponibilidade no produto**:

| Acesso | Disponibilidade | Estado exibido | Ação |
|---|---|---|---|
| Incluso | Disponível | **Disponível** (selo verde) | Botão "Abrir" para a rota do módulo |
| Incluso | Em construção | **Incluso no seu plano · em breve** (selo verde-claro + fase) | Sem botão de abrir; texto "Chega na Fase N" |
| Cota | qualquer | Igual a "Incluso", com o selo "Cota diária" | Igual |
| Não incluso | qualquer | **Disponível no plano X** (selo neutro, cadeado) | "Ver planos" (âncora para a comparação) |
| Contrato | qualquer | **Sob contrato** | "Falar com a equipe" (provisório: âncora para planos) |

Hoje nenhum módulo está publicado; todos aparecem como "em breve". Quando um módulo for liberado, muda-se só o campo `availability` no catálogo.

## 5. Fonte dos dados

**Agora (MVP sem tabelas no Directus):**
- O **catálogo de módulos** e a **matriz plano × módulo** ficam em código (`apps/web/lib/modules/`), tipados e testados.
- O **plano do usuário** é resolvido por `getUserPlan()`, que devolve `free` para todo usuário. Isso segue a regra da Fase 1B: toda organização nasce no plano gratuito.

**Depois (RN-200 e RN-122):**
- `getUserPlan()` passa a ler `subscriptions.plan_code` da organização ativa, pelo Directus, com o token do usuário.
- A matriz deixa de ser código e passa a vir de `plans.features.modules` (e cotas como `ai_daily_quota`).
- O papel do usuário na organização (`owner`, `nutritionist`, `assistant`) filtra os módulos clínicos. O assistente não abre módulos com dados clínicos.

A interface da tela não muda nessa troca: ela consome um objeto `ModuleAccessView[]`.

## 6. Layout

**Cabeçalho:** logo, alternador de tema e botão **Sair**. No celular, os mesmos itens compactos.

**Saudação:** "Olá, {nome}" e uma linha com o que fazer agora.

**Card do plano atual:**
- nome do plano;
- limite de pacientes ativos e limite de membros;
- botão "Comparar planos".
- **Não mostrar contagem de pacientes** enquanto não houver tabela de pacientes. Nada de números inventados.

**Seção "Seus módulos":** os módulos inclusos no plano, em grid de cards.
- Desktop: 3 colunas. Tablet: 2. Celular: 1.
- Cada card tem ícone, nome, resumo, até 4 itens do que inclui, selo de estado e ação.

**Seção "Disponíveis em outros planos":** os módulos não inclusos, com cadeado e o plano que libera cada um.

**Seção "Compare os planos":**
- tabela da seção 3 com os planos nas colunas;
- no celular, tabela com rolagem horizontal dentro do próprio contêiner, sem rolagem da página;
- marca o plano atual.

**Acessibilidade:**
- títulos em ordem (`h1` na saudação, `h2` nas seções, `h3` nos cards);
- selos com texto, sem depender só de cor;
- a tabela usa `<th scope>`;
- o cadeado é decorativo e o estado vem por escrito.

## 7. Critérios de aceite

- [ ] Usuário logado vê os 7 módulos: os inclusos em "Seus módulos" e os demais em "Disponíveis em outros planos".
- [ ] No plano gratuito, "Seus módulos" tem Clínico, Área do paciente e Assistente de IA (com selo "Cota diária"). Os outros quatro aparecem com o plano que os libera, e a Saúde pública como "Sob contrato".
- [ ] Todo módulo ainda não publicado mostra "em breve" e a fase do roadmap. Nenhum botão leva a uma rota inexistente.
- [ ] O card do plano mostra "Gratuito", "até 20 pacientes ativos" e "1 nutricionista", sem contagem inventada.
- [ ] A tabela de planos reflete a seção 3 e destaca o plano atual.
- [ ] Funciona de 360 px a 1440 px, sem rolagem horizontal da página, nos temas claro e escuro.
- [ ] Testes unitários cobrem a resolução de acesso (cada plano × cada módulo) e a separação em "Seus módulos" e "Outros planos".
- [ ] Sem sessão, `/app` continua redirecionando para `/login?next=/app`.

## 8. Fora do escopo

- Telas internas dos módulos (cada uma tem a sua fase no plano).
- Troca de plano e checkout (Fase 2, RN-057).
- Seletor de organização para quem participa de mais de uma (Fase 0, RN-006).
