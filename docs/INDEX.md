# Índice da documentação — Rafanutri

## Produto
- [01 — Visão do produto](01-visao-produto.md): problema, público, proposta de valor, modelo de negócio e métricas.
- [02 — Módulos](02-modulos.md): os cinco módulos, os diferenciais (IA e app do paciente) e a prioridade de cada funcionalidade.

## Módulos
- [UAN e Qualidade](modulos/uan.md): plano do módulo, entregas U0 a U7 e MVP do módulo (Qualidade BPF).

## Specs
- [Tela principal com os módulos do usuário](specs/tela-principal-modulos.md)
- [Cadastro e onboarding](specs/cadastro-onboarding.md)

## Pesquisa
- [Benchmark clínico](pesquisa/benchmark-clinico.md): concorrentes, diferenciais e lacunas incorporadas ao plano.

## Técnica
- [03 — Arquitetura](03-arquitetura.md): stack, visão de componentes, multi-tenant, integrações e ambientes.
- [04 — Modelo de dados](04-modelo-dados.md): entidades do MVP e regras de acesso.
- [05 — Segurança, LGPD e regulatório](05-seguranca-lgpd.md): dados sensíveis de saúde, prontuário, CFN, ANVISA.

## Execução
- [06 — Plano de implementação](06-plano-implementacao.md): resumo executivo das fases 0 a 6.
- [Plano detalhado](plano/00-visao-geral.md): cronograma, marcos, Definition of Ready/Done, fluxo de trabalho.
  - [Fase 0 — Fundação](plano/fase-0-fundacao.md)
  - [Fase 1 — MVP Clínico](plano/fase-1-mvp-clinico.md)
  - [Fase 1B — Plano gratuito e área do paciente](plano/fase-1b-freemium-area-paciente.md)
  - [Fase 2 — Gestão do consultório](plano/fase-2-gestao.md)
  - [Fase 3 — App do paciente + IA](plano/fase-3-app-paciente-ia.md)
  - [Fase 4 — Materno-infantil](plano/fase-4-materno-infantil.md)
  - [Fase 5 — UAN e Qualidade](plano/fase-5-uan-qualidade.md)
  - [Fase 6 — Saúde pública e avançados](plano/fase-6-saude-publica-avancados.md)
- [07 — Backlog](07-backlog.md): índice consolidado de todos os itens; o detalhe de cada item está no documento da fase.

## Decisões
- [ADR 0001 — Stack inicial](adr/0001-stack.md)
- [ADR 0002 — Multi-tenant com RLS](adr/0002-multi-tenant-rls.md)
- [ADR 0003 — App do paciente como PWA primeiro](adr/0003-app-paciente-pwa.md)
- [ADR 0004 — Infraestrutura do MVP na VPS existente](adr/0004-infraestrutura-hospedagem.md)
- [ADR 0008 — Backend com Directus](adr/0008-backend-directus.md)
- ADRs 0005 (provedor de WhatsApp), 0006 (provedor de LLM) e 0007 (estratégia offline do PWA) serão escritos nas Fases 2 e 3.

## Prompts
- [Tela inicial e login com parallax + deploy no Coolify](prompts/telas-inicial-e-login.md)

## Runbooks
- [Instalar o Directus na vpsrafa](runbooks/directus-vpsrafa.md)
- [Deploy do app web no Coolify](runbooks/deploy-web-coolify.md)

## Convenções
- Documentação em português do Brasil; código, identificadores, tabelas e colunas em inglês.
- IDs de backlog no formato `RN-<número>` (ex.: `RN-012`). Faixas por fase em [plano/00-visao-geral.md](plano/00-visao-geral.md); a Fase 1B usa RN-200 a RN-214.
- Cada decisão de arquitetura relevante vira um ADR numerado em `docs/adr/`.
