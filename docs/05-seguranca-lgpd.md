# 05 — Segurança, LGPD e requisitos regulatórios

> **Backend: Directus** ([ADR 0008](adr/0008-backend-directus.md)). Onde este documento cita Supabase, RLS, `auth.uid()`, Storage ou Edge Functions, leia pela tabela de equivalência do ADR 0008.

A Rafanutri trata **dados pessoais sensíveis de saúde** (LGPD, art. 5º, II, e art. 11). Isso define requisitos desde o primeiro dia, não como melhoria posterior.

> **MVP:** a adequação à LGPD está **fora do escopo inicial** (decisão em [ADR 0004](adr/0004-infraestrutura-hospedagem.md)). No MVP valem só os itens marcados como "MVP" na tabela abaixo. O restante deste documento é o alvo para quando um gatilho de revisão do ADR ocorrer. Itens adiados no backlog: RN-016, RN-021, RN-059 e RN-081.

## Papéis na LGPD

- **Nutricionista/clínica:** controlador dos dados dos seus pacientes.
- **Rafanutri:** operador (trata os dados em nome do profissional), e controlador apenas dos dados de cadastro e cobrança dos próprios clientes.
- Isso precisa constar nos Termos de Uso e no contrato de tratamento de dados (DPA) com os clientes.

## Requisitos (alvo pós-MVP; no MVP só RLS, segredos fora do repositório e backups)

| Requisito | Como atender |
|---|---|
| Base legal e consentimento | Registro de consentimento do paciente com versão do termo, data, IP e canal (`consent_records`) |
| Minimização | CPF opcional; coletar só o que o atendimento usa |
| Controle de acesso | RLS em todas as tabelas; papel `assistant` sem acesso a dados clínicos |
| Rastreabilidade | `audit_logs` para leitura e alteração de prontuário, anamnese e avaliações |
| Criptografia | TLS em trânsito; criptografia em repouso do Supabase; buckets privados com URLs assinadas de curta duração |
| Direitos do titular | Exportar dados do paciente (JSON/PDF) e fluxo de exclusão/anonimização respeitando o prazo de guarda do prontuário |
| Segredos | Chaves (Supabase service role, LLM, WhatsApp) só no servidor e em variáveis de ambiente; nunca no repositório nem no cliente |
| Região dos dados | Projeto Supabase em São Paulo (sa-east-1) |
| Backups | Backups diários com retenção definida e teste de restauração |
| Incidentes | Procedimento de resposta e comunicação à ANPD e aos titulares |

## IA e dados de saúde

- Enviar ao LLM só o mínimo necessário, sem nome, CPF ou contato do paciente (pseudonimizar).
- Usar provedor com contrato que impeça uso dos dados para treinamento e com retenção controlada.
- Registrar em `ai_suggestions` o que foi sugerido e se o profissional aceitou, editou ou descartou.
- A IA não emite prescrição: toda sugestão passa pela revisão do nutricionista responsável.

## Regulatório da nutrição

| Tema | Referência | Impacto no produto | A validar |
|---|---|---|---|
| Prontuário e registro do atendimento | Resoluções do CFN e Código de Ética do Nutricionista | Prontuário com autoria (nome e CRN), data e histórico imutável de versões | Prazo de guarda e regras de prontuário eletrônico vigentes |
| Atendimento não presencial | Resolução CFN sobre teleconsulta | Registro do modo da consulta e consentimento | Exigências atuais do CFN |
| Assinatura de documentos | ICP-Brasil / assinatura eletrônica | Plano alimentar e atestados com assinatura do profissional | Nível de assinatura exigido |
| Boas Práticas em serviços de alimentação | ANVISA RDC 216/2004 e normas estaduais/municipais | Checklists, POPs, Manual de Boas Práticas | Normas locais dos primeiros clientes Enterprise |
| Rotulagem nutricional | ANVISA RDC 429/2020 e IN 75/2020 | Geração de tabela nutricional a partir da ficha técnica | — |
| Tabelas de composição | TACO (NEPA/Unicamp), TBCA (USP/FoRC) | Importação das bases e citação da fonte | Termos de uso e licença de cada base para uso comercial |

As validações da coluna "A validar" ficam como tarefas no backlog (Fase 0) e devem ser conferidas com a nutricionista responsável técnica e, se necessário, com assessoria jurídica.

## Infraestrutura e ferramentas de terceiros

Detalhes no [ADR 0004](adr/0004-infraestrutura-hospedagem.md).

| Ferramenta | No MVP | Pós-MVP (com LGPD) |
|---|---|---|
| vpsrafa (Oracle Always Free, Frankfurt, compartilhada) | Hospeda tudo, inclusive dados reais | Migrar banco e app para serviços gerenciados no Brasil |
| Modelos `:free` do OpenRouter | Permitidos | Provedor pago com contrato de não treinamento + pseudonimização (RN-081) |
| Evolution API (WhatsApp não oficial) | Permitida, com número dedicado | API oficial (Cloud API da Meta) |
| Backup externo diário | **Obrigatório** | Obrigatório |
| RLS e isolamento entre organizações | **Obrigatório** | Obrigatório |

## Práticas de desenvolvimento

- Nenhum dado real de paciente em ambiente local ou de staging; usar dados sintéticos do `seed`.
- Arquivos `.env*` fora do controle de versão; exemplo em `.env.example` sem valores reais.
- Testes automatizados das políticas de RLS (um usuário não pode ler dados de outra organização).
- Dependências verificadas no CI (audit) e revisão de código obrigatória para mudanças em migrações e políticas.
