# ADR 0004 — Infraestrutura do MVP na VPS existente

- **Status:** aceito
- **Data:** 2026-11-09

## Contexto

A Rafanutri começa como **MVP**. Já existe uma VPS em operação (a "vpsrafa"): Oracle Cloud no plano Always Free, ARM64 (Ampere A1), 2 OCPU e 12 GB de RAM, região Frankfurt, Ubuntu 24.04, com Coolify e Traefik (HTTPS automático por Let's Encrypt), DNS no Cloudflare, n8n, Evolution API disponível e acesso ao OpenRouter. A mesma máquina hospeda outros projetos, inclusive o backend do app **BPF Check**.

O objetivo nesta etapa é validar o produto com o menor custo possível. Adequação à LGPD **não é prioridade no MVP** e será tratada antes de escalar (ver "Gatilhos para revisar").

## Decisão

Todo o MVP roda na vpsrafa, gerenciado pelo Coolify.

| Componente | Como fica no MVP |
|---|---|
| App web (Next.js) | Aplicação no Coolify ligada ao GitHub; `Dockerfile` multi-stage (`output: 'standalone'`), build ARM64 |
| Banco, Auth, Storage | **Supabase self-hosted** na VPS (template de serviço do Coolify), mantendo RLS, Auth, Storage e Edge Functions como no plano |
| n8n | Instância **dedicada** da Rafanutri (container e Postgres próprios), separada do n8n pessoal |
| WhatsApp | **Evolution API** já disponível na infraestrutura |
| IA | **OpenRouter** com fallback entre modelos `:free`, como já usado em outros projetos da VPS |
| Ambientes | `staging` e `produção` como duas aplicações no mesmo Coolify, com bancos separados |
| DNS e TLS | Subdomínios no Cloudflare, TLS pelo Traefik |
| Monitoramento | Monitor externo já existente (UptimeRobot) também batendo na Rafanutri + Sentry |

### Requisitos mínimos mesmo no MVP

Não são requisitos de LGPD. São proteções baratas contra perda de dados e invasão:

1. **Backup diário do Postgres para fora da VPS** (ex.: `pg_dump` agendado enviado ao Object Storage da Oracle ou ao Cloudflare R2, com retenção de 14 dias) e um teste de restauração por mês. A Oracle já reclamou uma instância Always Free por ociosidade, e sem backup externo os dados se perdem.
2. A **RLS** continua obrigatória: ela isola os dados entre os nutricionistas, que são clientes diferentes.
3. Segredos ficam no Coolify e nos secrets do GitHub, nunca versionados.
4. Os containers da Rafanutri ficam numa rede Docker própria; só o Traefik é compartilhado com os outros projetos.
5. O staging fica protegido (autenticação básica) e não indexável.

### Orçamento de recursos (2 OCPU / 12 GB compartilhados)

| Serviço | RAM estimada |
|---|---|
| Supabase self-hosted (Postgres, Auth, REST, Storage, Realtime, Kong, Studio) | 2 a 3 GB |
| App web (produção + staging) | 0,5 a 1 GB |
| n8n dedicado + Postgres | 0,5 GB |
| **Total Rafanutri** | **cerca de 3 a 4,5 GB** |

Antes da Fase 0, medir o consumo atual da VPS (`docker stats`, `free -h`). Se faltar memória:
- desligar os serviços do Supabase que não são usados (Realtime até a Fase 6, Studio fora do horário de trabalho);
- ou usar o Supabase Cloud gratuito só para o staging.

## Alternativas consideradas

- **Serviços gerenciados no Brasil (Supabase Pro em São Paulo + Vercel Pro):** mais robusto e já adequado à LGPD, mas com custo mensal desde o primeiro dia. Fica como destino pós-MVP.
- **Supabase Cloud gratuito para o banco + VPS para o app:** sem custo, mas o projeto gratuito pausa por inatividade e o banco ficaria longe do app. Fica como plano B se faltar memória na VPS.

## Gatilhos para revisar esta decisão

Revisar (e escrever um novo ADR) quando ocorrer **qualquer** um destes:
- primeiros clientes pagantes, ou mais de cerca de 20 nutricionistas ativos;
- uso de dados reais de pacientes em escala;
- primeiro cliente Enterprise (UAN), que vai exigir contrato e LGPD;
- uso da VPS acima de 70% de CPU ou memória de forma sustentada;
- reclamação da instância pela Oracle ou indisponibilidade relevante.

Nessa revisão, a direção esperada é:
- banco e app em serviços gerenciados no Brasil;
- WhatsApp pela API oficial;
- LLM pago com contrato de não treinamento;
- executar os itens de LGPD adiados (ver [05-seguranca-lgpd.md](../05-seguranca-lgpd.md)).

## Consequências

- Custo de infraestrutura zero no MVP.
- Disponibilidade sem SLA: aceitável para o MVP, com backup externo como rede de segurança.
- Supabase self-hosted exige operar atualizações e backups por conta própria.
- Evolution API é não oficial: o número de WhatsApp pode ser bloqueado. Usar um número dedicado à Rafanutri, não o pessoal.
- Modelos `:free` têm limite de 50 requisições por dia por conta, o que basta para o MVP. Se faltar, os créditos do OpenRouter elevam o limite.

## Relação com o BPF Check

O app BPF Check, já em produção na mesma VPS, cobre parte do Módulo UAN/Qualidade (checklists de Boas Práticas). Na Fase 5 (RN-120), avaliar o que reaproveitar dele: modelos de checklist, fluxo mobile, workflow multiagente e usuários atuais.
