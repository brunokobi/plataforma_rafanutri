# Rafanutri

Plataforma SaaS que reúne as áreas da nutrição em um só lugar: atendimento clínico e esportivo, materno-infantil, saúde pública, Unidades de Alimentação e Nutrição (UAN) com gestão de qualidade, e gestão do negócio do nutricionista.

> **Status:** fase de concepção. Este repositório contém, por enquanto, a documentação do produto e o plano de implementação. O código começa na Fase 0 do plano.

## Estratégia em uma frase

Lançar primeiro o **Módulo Clínico + Gestão de Consultório** (SaaS por nutricionista, venda rápida e receita recorrente) e, com essa base, empacotar o **Módulo UAN/Qualidade** como versão Enterprise para empresas de alimentação (ticket alto, B2B).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/INDEX.md](docs/INDEX.md) | Índice geral da documentação |
| [docs/01-visao-produto.md](docs/01-visao-produto.md) | Visão, público, proposta de valor e modelo de negócio |
| [docs/02-modulos.md](docs/02-modulos.md) | Os módulos da plataforma e suas funcionalidades |
| [docs/03-arquitetura.md](docs/03-arquitetura.md) | Stack, arquitetura, multi-tenant e integrações |
| [docs/04-modelo-dados.md](docs/04-modelo-dados.md) | Modelo de dados inicial (MVP) |
| [docs/05-seguranca-lgpd.md](docs/05-seguranca-lgpd.md) | Segurança, LGPD e requisitos regulatórios |
| [docs/06-plano-implementacao.md](docs/06-plano-implementacao.md) | Fases, entregas e critérios de pronto |
| [docs/07-backlog.md](docs/07-backlog.md) | Backlog inicial com IDs |
| [docs/adr/](docs/adr/) | Registros de decisões de arquitetura |

## Stack proposta

- **Web:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend/BaaS:** Supabase (Postgres, Auth, Storage, Row Level Security, Edge Functions)
- **Automação:** n8n (lembretes, WhatsApp, e-mails, rotinas agendadas)
- **IA:** LLM via API + RAG com pgvector no próprio Supabase
- **App do paciente:** PWA na primeira versão; app nativo (Expo/React Native) depois

Detalhes e justificativas em [docs/03-arquitetura.md](docs/03-arquitetura.md) e [docs/adr/0001-stack.md](docs/adr/0001-stack.md).
