# 07 — Backlog

Formato: `RN-<nº>`. Estimativas em pontos relativos (1, 2, 3, 5, 8). Status: `todo`, `doing`, `done`.

## Fase 0 — Fundação

| ID | Item | Pts | Status |
|---|---|---|---|
| RN-001 | Criar monorepo (pnpm + Turborepo) com `apps/web` e `packages/*` | 3 | todo |
| RN-002 | Configurar Next.js com TypeScript, Tailwind e shadcn/ui | 2 | todo |
| RN-003 | Configurar Supabase local (CLI) e projeto de staging | 2 | todo |
| RN-004 | Migração: `organizations`, `profiles`, `organization_members`, `audit_logs` | 3 | todo |
| RN-005 | Autenticação: e-mail/senha, Google, recuperação de senha | 3 | todo |
| RN-006 | Onboarding: criar organização no primeiro acesso | 2 | todo |
| RN-007 | Convite de membros e papéis (`owner`, `nutritionist`, `assistant`) | 5 | todo |
| RN-008 | Políticas RLS base + testes automatizados de isolamento entre organizações | 5 | todo |
| RN-009 | Gatilhos de auditoria para tabelas sensíveis | 3 | todo |
| RN-010 | Migração da base de alimentos (`food_sources`, `foods`, `nutrients`, `food_nutrients`) | 3 | todo |
| RN-011 | Script de importação da TACO | 5 | todo |
| RN-012 | Script de importação da TBCA (após validar licença) | 5 | todo |
| RN-013 | Layout base do painel (menu, cabeçalho, tema claro/escuro) | 3 | todo |
| RN-014 | CI: lint, typecheck, testes, build; preview na Vercel | 3 | todo |
| RN-015 | Validar licenças TACO/TBCA, regras CFN de prontuário e teleconsulta | 2 | todo |
| RN-016 | Termos de Uso, Política de Privacidade e DPA (rascunho para jurídico) | 3 | todo |

## Fase 1 — MVP Clínico

| ID | Item | Pts | Status |
|---|---|---|---|
| RN-020 | Pacientes: CRUD, busca, filtros, status | 5 | todo |
| RN-021 | Consentimento LGPD do paciente (`consent_records`) | 3 | todo |
| RN-022 | Agenda: visão dia/semana, criar/remarcar/cancelar consulta | 8 | todo |
| RN-023 | Prontuário: linha do tempo e evolução (`clinical_notes`) | 5 | todo |
| RN-024 | Anamnese: modelos padrão (clínica, esportiva) | 3 | todo |
| RN-025 | Editor de questionário customizável (`schema jsonb`) | 8 | todo |
| RN-026 | Link público de anamnese com token e Edge Function | 5 | todo |
| RN-027 | `nutrition-core`: IMC, protocolos de dobras e % gordura, com testes | 5 | todo |
| RN-028 | Tela de avaliação antropométrica e gráficos de evolução | 5 | todo |
| RN-029 | `nutrition-core`: fórmulas de GET (Harris-Benedict, Mifflin-St Jeor, Cunningham, FAO/OMS), com testes | 3 | todo |
| RN-030 | Tela de cálculo energético e metas de macronutrientes | 3 | todo |
| RN-031 | Editor de plano alimentar por refeição com busca de alimentos | 8 | todo |
| RN-032 | Cálculo em tempo real de calorias, macros e micros vs. metas | 5 | todo |
| RN-033 | Medidas caseiras por alimento | 3 | todo |
| RN-034 | Substituições por equivalência nutricional | 5 | todo |
| RN-035 | Modelos de plano e duplicação | 3 | todo |
| RN-036 | PDF do plano alimentar com marca do profissional | 5 | todo |
| RN-037 | Testes e2e do fluxo completo de consulta | 5 | todo |
| RN-038 | Seed de dados sintéticos para demonstração | 2 | todo |

## Fase 2 — Gestão do consultório

| ID | Item | Pts | Status |
|---|---|---|---|
| RN-050 | Subir n8n (self-hosted) e conectar ao Supabase | 3 | todo |
| RN-051 | Lembrete de consulta por WhatsApp e e-mail | 5 | todo |
| RN-052 | Lembrete de retorno e envio de link de anamnese | 3 | todo |
| RN-053 | Financeiro: recebimentos e fluxo de caixa | 5 | todo |
| RN-054 | Pacotes de consultas | 3 | todo |
| RN-055 | Recibo em PDF | 2 | todo |
| RN-056 | CRM: funil e retornos atrasados | 5 | todo |
| RN-057 | Planos do SaaS, trial e cobrança recorrente | 8 | todo |
| RN-058 | Sincronização com Google Calendar | 5 | todo |

## Fase 3 — App do paciente + IA

| ID | Item | Pts | Status |
|---|---|---|---|
| RN-070 | PWA: instalação, magic link, layout mobile | 5 | todo |
| RN-071 | Plano do dia e substituições no app | 5 | todo |
| RN-072 | Lista de compras | 3 | todo |
| RN-073 | Diário alimentar e hidratação | 5 | todo |
| RN-074 | Notificações push | 3 | todo |
| RN-075 | Sugestão de plano alimentar por IA (alimentos da base, cálculo pelo `nutrition-core`) | 8 | todo |
| RN-076 | Resumo de anamnese e histórico por IA | 3 | todo |
| RN-077 | Registro de sugestões e limites de uso por plano | 3 | todo |

## Fases 4 a 6

Detalhar no início de cada fase, a partir de [06-plano-implementacao.md](06-plano-implementacao.md).
