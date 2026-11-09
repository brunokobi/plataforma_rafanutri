# ADR 0002 — Multi-tenant com banco compartilhado e RLS

- **Status:** proposto
- **Data:** 2026-11-09

## Contexto

A plataforma atende muitos nutricionistas e empresas. Cada organização só pode ver os próprios dados, e há papéis com acessos diferentes (ex.: assistente sem acesso a dados clínicos).

## Decisão

Banco único com coluna `organization_id` em todas as tabelas de negócio e isolamento por **Row Level Security** no Postgres, baseado em `organization_members` e no papel do usuário. Funções auxiliares (`is_member(org_id)`, `has_role(org_id, role)`) com `security definer` centralizam as regras.

## Alternativas consideradas

- **Banco/schema por cliente:** isolamento mais forte, mas custo operacional alto para milhares de nutricionistas. Pode ser oferecido no futuro para clientes Enterprise que exigirem.

## Consequências

- Toda nova tabela precisa de política RLS antes de ir para produção (checado no CI).
- Testes automatizados de isolamento entre organizações são obrigatórios.
- A chave `service_role` só é usada no servidor e em jobs controlados.
