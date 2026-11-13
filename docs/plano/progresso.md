# Progresso da implementação

Atualizado em **10/11/2026**. O que já está no código (`main`), o que está só em **demonstração** (interface completa, sem banco) e o que falta. Os IDs são os do [backlog](../07-backlog.md).

> **Situação geral (10/11/2026, noite):** o banco foi liberado. Cadastro, onboarding e consultório já gravam no Directus, com isolamento entre consultórios testado, e a TACO está no banco. O módulo clínico (pacientes, avaliação, plano alimentar) segue em **demonstração**, sem salvar.

## Legenda

| Situação | Significado |
|---|---|
| ✅ Feito | Implementado e testado; funciona de verdade |
| 🧪 Demonstração | Interface e cálculos prontos, com dados de exemplo; falta o banco para salvar |
| 🔒 Pronto, desligado | Código pronto atrás de uma chave (`SIGNUP_OPEN`), aguardando o banco |
| ⏳ Pendente | Ainda não começou |

## Fase 0 — Fundação

| Item | Situação | Observação |
|---|---|---|
| RN-001 Monorepo | ✅ | pnpm + Turborepo, `apps/web`, `packages/nutrition-core`, `packages/config` |
| RN-002 App web | ✅ | Next.js 16, React 19, Tailwind 4, shadcn/ui, TypeScript estrito |
| RN-003 Backend | 🟡 parcial | Directus 12.6.1 na vpsrafa com licença gratuita (Open Innovation Grant), migrações em `db/` e extensão em `directus/extensions/` ([runbook](../runbooks/directus-vpsrafa.md)); **sem backup diário ainda** |
| RN-004 Tabelas de organização | ✅ | Migração 0002: `organizations`, `organization_members`, `professional_profiles`, `plans`; slug único, gatilhos de último owner e limite de membros; testes em `db/tests/0002_organizations.test.sql`. Convites e auditoria ficam para RN-007/RN-009 |
| RN-005 Autenticação | ✅ login · ✅ cadastro | Login e logout reais; cadastro aberto com login automático. **Sem verificação por e-mail** (falta SMTP); recuperação de senha também depende de SMTP |
| RN-006 Onboarding | ✅ | Grava o consultório pelo endpoint `/rafanutri/organizations`; redireciona quem não tem consultório. Falta: upload do logo e seletor de consultório ([spec](../specs/cadastro-onboarding.md)) |
| RN-007 Convites e papéis | ⏳ | |
| RN-008 Isolamento entre organizações | 🟡 base | Permissões filtradas pela organização no papel Profissional + gatilhos no banco; 15 verificações em `db/tests/api-isolation.test.mjs`. Falta rodar no CI e estender a cada tabela nova |
| RN-010 e RN-011 Base de alimentos | 🟡 | TACO 4ª edição no banco (597 alimentos, 29 nutrientes) com busca sem acento ([db/README](../../db/README.md)) e já usada pelo editor de plano. Falta a página `/alimentos`. RN-012 (TBCA) pendente |
| RN-013 Layout | ✅ | Cabeçalho da área logada, tema claro e escuro, responsivo |
| RN-014 CI/CD | 🟡 parcial | GitHub Actions e Dockerfile ARM64; app no Coolify (`rafanutri-web`). Falta o webhook do GitHub para deploy automático ([runbook](../runbooks/deploy-web-coolify.md)) |
| RN-019 Identidade visual | ✅ | Paleta, tipografia, logo provisório, ilustrações vetoriais próprias |

## Fase 1 — MVP Clínico

| Item | Situação | Observação |
|---|---|---|
| RN-020 Pacientes | ✅ | Cadastro, busca sem acento, filtro por status, arquivar e reativar gravando no Directus; limite de 20 ativos do plano gratuito (banco + gancho + tela); CPF com dígito verificador e único no consultório; telefone em E.164. **Editar** e **ficha real** (`/app/pacientes/[id]`) feitos em 11/11/2026. Falta: detecção de duplicidade por nome + nascimento |
| RN-022 Agenda | ✅ base | `/app/agenda`: semana de segunda a domingo, nova consulta com horários livres sugeridos (expediente 08h–18h), presencial ou online com link, confirmar, concluir (atalho para a ficha), faltou, cancelar e remarcar; atalho "Marcar consulta" na ficha. Sem sobreposição por nutricionista (banco + gancho). Falta: arrastar para remarcar, expediente configurável, filtro por nutricionista (clínicas) |
| RN-024 a RN-026 Anamnese | ✅ base | Questionários em `/app/questionarios` (3 modelos padrão a validar com a nutricionista; duplicar e editar com seções, 8 tipos de pergunta, obrigatória, ajuda e condição "mostrar só se", com pré-visualização). Aba **Anamneses** na ficha: gerar link (3 a 30 dias), copiar, WhatsApp, preencher com o paciente, ver respostas, revisar e cancelar. Página pública `/r/[token]` sem login, com rascunho e envio final. Falta: e-mail com o link (depende do SMTP), arrastar para reordenar, aviso no painel quando o paciente responde |
| RN-035 Modelos de plano | ✅ base | "Salvar como modelo" em qualquer plano da ficha; "Novo a partir de modelo" com ajuste opcional à meta de calorias (escala proporcional e arredondada); página `/app/modelos-de-plano` com busca, etiquetas, refeições, renomear e apagar. Falta: biblioteca de métodos de prescrição (low carb, DASH, mediterrânea…), que depende da validação da nutricionista |
| RN-023 Prontuário (linha do tempo) | 🟡 | Ficha real com dados pessoais (CPF mascarado, atalho de WhatsApp), objetivo e situação, editar e arquivar/reativar; avaliações (0005) e planos (0006) por paciente **ativos desde 12/11/2026**; card do plano publicado no resumo. Linha do tempo só na paciente de exemplo |
| RN-027 Antropometria e composição corporal | ✅ cálculo · 🧪 tela | `nutrition-core`: IMC, Jackson & Pollock 3/7, Durnin, Faulkner, ISAK, Siri/Brozek |
| RN-028 Avaliação e gráficos | ✅ | Aba **Avaliações** na ficha real (`/app/pacientes/[id]/avaliacoes`): cálculo ao vivo, salvar (resultados recalculados no servidor), histórico e gráficos. Migração 0005 aplicada e coleção registrada no Directus em 12/11/2026 (testes SQL e de isolamento pela API passaram) ([db/README](../../db/README.md#avaliações-antropométricas-rn-028)) |
| RN-029 Gasto energético | ✅ cálculo · 🧪 tela | Harris-Benedict, Mifflin-St Jeor, Cunningham, FAO/OMS |
| RN-030 Metas | ✅ base | No editor dos planos do paciente: fórmula, fator de atividade, ajuste, proteína em g/kg e lipídios em %, com peso e altura da última avaliação (sem eles, calorias manuais) |
| RN-031 Editor de plano | ✅ | Aba **Plano alimentar** na ficha real (`/app/pacientes/[id]/planos`): criar, salvar rascunho, publicar (arquiva o anterior), nova versão a partir de um publicado e apagar rascunho. Busca e substituições usam a TACO do banco. Metas usam o peso e a altura da última avaliação; sem eles, calorias manuais. Migrações 0005 e 0006 aplicadas e coleções registradas no Directus em 12/11/2026 (testes SQL e de isolamento pela API passaram) ([db/README](../../db/README.md#planos-alimentares-por-paciente-rn-031-rn-036)) |
| RN-032 Cálculo em tempo real | ✅ base | Plano × metas com faixas de adequação, nos planos reais do paciente |
| RN-033 Medidas caseiras | 🟡 | Medidas de 25 alimentos comuns da TACO no banco (migração 0003, **revisar com a nutricionista**); nos demais, a quantidade aparece em gramas |
| RN-034 Substituições | ✅ base | Equivalência em energia no mesmo grupo e estado de preparo, em medida caseira, com a TACO e os alimentos do consultório |
| RN-036 PDF do plano | ✅ base | PDF gerado no navegador com nome, cor e CRN do consultório; refeições em medida caseira e gramas, substituições, orientações e a seção **Preparações** (ingredientes e modo de preparo das receitas do consultório usadas no plano). Falta: guardar o PDF gerado vinculado à versão publicada |
| RN-039 Painel inicial | ✅ base | Tela inicial (`/app`) com consultas de hoje (link para a ficha e para a chamada online), anamneses respondidas a revisar, pacientes sem retorno há mais de 60 dias (com atalho para marcar), aniversariantes dos próximos 7 dias e atalhos. Cada parte falha sozinha sem derrubar as outras. Falta: dias de retorno configuráveis |
| RN-040 Ficha resumo | ✅ base | Alergias e restrições da anamnese respondida mais recente em destaque no cabeçalho de todas as abas da ficha e no editor de plano (com a fonte e se já foi revisada); variação de peso e gordura em relação à avaliação anterior; cartão da próxima consulta. Falta: última evolução (depende do prontuário com evoluções) |
| RN-046 Envio do plano | 🟡 | "Enviar por WhatsApp" nos planos publicados: abre o WhatsApp do paciente com o plano em texto (refeições, medidas, substituições, orientações e preparações). Falta: envio por e-mail (depende do SMTP/DNS do Resend) e registro do envio na linha do tempo |
| RN-049 Endurecimento de segurança | ✅ código | Relatório em [docs/seguranca/revisao-fase-1.md](../seguranca/revisao-fase-1.md): CSP em produção, teste de IDOR, revisão de permissões e logs, token da anamnese fora da URL. **Pendência crítica de operação: backup diário automático** |
| RN-041/042 Alimentos e preparações próprios | ✅ base | `/app/alimentos`: alimento pelo rótulo (porção → 100 g) ou por 100 g, medidas caseiras, copiar da TACO para ajustar, arquivar/reativar; preparações com ingredientes (TACO e próprios), rendimento, porções, modo de preparo e prévia da composição. Aparecem na busca do editor marcados como próprios. Modo de preparo no PDF do plano: feito |

## Fase 1B — Plano gratuito e área do paciente

| Item | Situação | Observação |
|---|---|---|
| RN-200 a RN-202 Plano gratuito e limite | 🧪 | Tela principal com os módulos por plano ([spec](../specs/tela-principal-modulos.md)); hoje todo usuário é tratado como plano gratuito |
| RN-203 a RN-215 Área do paciente | ⏳ | |

## Página pública e marketing

| Item | Situação |
|---|---|
| Página inicial (hero, áreas de atuação, recursos, editor, IA, benefícios, princípios, planos, perguntas frequentes) | ✅ |
| Termos e Privacidade | Páginas provisórias ("em elaboração") |

## Qualidade

| Verificação | Resultado em 10/11/2026 |
|---|---|
| Testes do app web (Vitest + Testing Library) | 95 passando |
| Testes do `nutrition-core` | 41 passando |
| Testes de ponta a ponta (Playwright, computador e celular) | 16 passando; 2 pulados (login real, exige usuário de teste) |
| Lint e typecheck | Sem erros nem avisos |

## Próximos passos

| Depende de | Passo |
|---|---|
| Dev | Servidor de e-mail (SMTP) para verificação de cadastro e recuperação de senha |
| Dev | Backup diário do banco (bloqueado pelo controle de permissões), UptimeRobot, webhook do GitHub, fechar a porta 8010 |
| Nenhum | Página `/alimentos`; ampliar as medidas caseiras (RN-033) com a nutricionista |
| Nenhum | Fase 1 com banco: pacientes (RN-020) com o limite de 20 do plano gratuito, avaliação e plano alimentar salvos |
