# ADR 0004 — Infraestrutura e uso da VPS existente

- **Status:** proposto
- **Data:** 2026-11-09

## Contexto

Já existe uma VPS em operação: Oracle Cloud no plano Always Free, ARM64 (Ampere A1), 2 OCPU e 12 GB de RAM, região Frankfurt, Ubuntu 24.04, com Coolify e Traefik (HTTPS automático por Let's Encrypt), DNS no Cloudflare e um n8n em uso. A mesma máquina roda outros projetos pessoais, inclusive serviços públicos e um agente de IA autônomo em teste, e já hospeda o backend do app **BPF Check** (FastAPI + Postgres), com um workflow multiagente no n8n.

Usar essa VPS reduz custo no início. Porém a Rafanutri trata **dados sensíveis de saúde** (LGPD, art. 11), e o histórico dessa infraestrutura mostra riscos concretos:

| Fato | Risco para dados de pacientes |
|---|---|
| Uma instância Always Free anterior foi reclamada pela Oracle por ociosidade, sem aviso | Indisponibilidade de produção por tempo indeterminado ("Out of host capacity" pode durar meses) |
| Always Free não tem SLA nem backup gerenciado | Perda de dados e de prontuário, que tem obrigação de guarda |
| Host compartilhado com projetos pessoais e um agente autônomo | Superfície de ataque maior; uma falha em outro serviço expõe o banco de saúde |
| Região Frankfurt | Transferência internacional de dados (LGPD, art. 33) e cerca de 200 ms a mais de latência para usuários no Brasil |
| 2 OCPU e 12 GB já divididos com vários serviços | Sem folga para Postgres e Supabase self-hosted em produção |
| Modelos `:free` do OpenRouter usados nos projetos atuais | Provedores gratuitos podem registrar prompts, e o limite é de 50 requisições por dia por conta |
| Evolution API (WhatsApp não oficial) disponível | Risco de bloqueio do número e de violar os termos do WhatsApp num produto comercial |

## Decisão

Arquitetura **híbrida**: a VPS existente fica com o que não envolve dados reais de pacientes, e a produção vai para serviços gerenciados no Brasil.

| Componente | Desenvolvimento e staging | Produção (dados reais) |
|---|---|---|
| Banco, Auth, Storage | Supabase Cloud, projeto gratuito de staging (região próxima da VPS) | **Supabase Cloud Pro, região São Paulo** (backups diários e PITR opcional) |
| App web (Next.js) | **VPS via Coolify**: deploy automático de `main` e previews por PR | Hospedagem próxima de São Paulo: Vercel Pro (região `gru1`) **ou** VPS paga e dedicada no Brasil, gerenciada pelo mesmo Coolify |
| n8n | **Instância dedicada da Rafanutri na VPS** (container e Postgres próprios, separados do n8n pessoal) | Mesma instância dedicada, que só recebe dados mínimos (primeiro nome, telefone, data e hora); migrar para host pago se o volume crescer |
| WhatsApp | Evolution API permitida **só** para testes internos, com números de teste | API oficial (Cloud API da Meta via BSP), conforme a Fase 2 |
| LLM | OpenRouter `:free` permitido **só** com dados sintéticos | Provedor pago com contrato de não treinamento e retenção controlada (ADR 0006) |
| Demonstrações comerciais | VPS, com seed sintético | — |
| Monitoramento | UptimeRobot já existente + Sentry | Sentry + alertas do Supabase |

Regras:
1. **Nenhum dado real de paciente na VPS Always Free**, nem em staging.
2. O n8n da Rafanutri é **separado** do n8n pessoal: outra instância, outro `N8N_ENCRYPTION_KEY`, outras credenciais e outro banco.
3. Segredos da Rafanutri ficam no Coolify, no GitHub Secrets e na Vercel. **Não** vão para o repositório de recuperação da VPS, que guarda segredos em texto puro.
4. Os containers da Rafanutri usam uma rede Docker própria. Só o Traefik é compartilhado.
5. Antes de abrir o beta (fim da Fase 1), a produção precisa estar nos serviços gerenciados da coluna da direita.

## Alternativas consideradas

- **Tudo na VPS Always Free, com Supabase self-hosted:** custo zero, mas sem SLA, com risco de reclamação, dados fora do Brasil e recursos insuficientes. Rejeitada para produção.
- **VPS paga no Brasil para tudo, com Supabase self-hosted:** custo previsível e dados no Brasil, mas backup, atualização e segurança do Postgres e do Auth ficam por nossa conta. Pode ser revisitada quando houver escala e equipe de operação.
- **Somente serviços gerenciados (sem usar a VPS):** mais simples, mas desperdiça a infraestrutura de staging e o n8n que já existem.

## Consequências

- Custo mensal mínimo em produção a partir do beta: Supabase Pro e hospedagem do app web. Os valores devem ser confirmados nos sites dos fornecedores na Fase 0. A Vercel Hobby não permite uso comercial, então em produção seria o plano Pro ou VPS paga.
- Staging e demonstrações sem custo adicional.
- A VPS segue sujeita à reclamação por ociosidade. O monitor externo que gera carga real continua obrigatório, e o staging precisa ser recriável a partir do repositório (Coolify + migrações + seed).
- A Política de Privacidade lista os suboperadores e onde ficam os dados de cada um.

## Relação com o BPF Check

O app BPF Check, já em produção na mesma VPS, cobre parte do Módulo UAN/Qualidade (checklists de Boas Práticas). Na Fase 5 (RN-120), avaliar o que reaproveitar do BPF Check: modelos de checklist, fluxo do app, aprendizados de uso e o workflow multiagente. As opções são integrar o BPF Check à Rafanutri ou migrar os clientes dele para cá.
