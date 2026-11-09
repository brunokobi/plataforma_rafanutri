# Índice da documentação — Rafanutri

## Produto
- [01 — Visão do produto](01-visao-produto.md): problema, público, proposta de valor, modelo de negócio e métricas.
- [02 — Módulos](02-modulos.md): os cinco módulos, os diferenciais (IA e app do paciente) e a prioridade de cada funcionalidade.

## Técnica
- [03 — Arquitetura](03-arquitetura.md): stack, visão de componentes, multi-tenant, integrações e ambientes.
- [04 — Modelo de dados](04-modelo-dados.md): entidades do MVP e regras de acesso.
- [05 — Segurança, LGPD e regulatório](05-seguranca-lgpd.md): dados sensíveis de saúde, prontuário, CFN, ANVISA.

## Execução
- [06 — Plano de implementação](06-plano-implementacao.md): fases 0 a 6, entregas, critérios de pronto e riscos.
- [07 — Backlog](07-backlog.md): itens numerados por fase.

## Decisões
- [ADR 0001 — Stack inicial](adr/0001-stack.md)
- [ADR 0002 — Multi-tenant com RLS](adr/0002-multi-tenant-rls.md)
- [ADR 0003 — App do paciente como PWA primeiro](adr/0003-app-paciente-pwa.md)

## Convenções
- Documentação em português do Brasil; código, identificadores, tabelas e colunas em inglês.
- IDs de backlog no formato `RN-<número>` (ex.: `RN-012`).
- Cada decisão de arquitetura relevante vira um ADR numerado em `docs/adr/`.
