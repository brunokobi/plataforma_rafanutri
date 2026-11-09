# ADR 0003 — App do paciente como PWA primeiro

- **Status:** proposto
- **Data:** 2026-11-09

## Contexto

O app do paciente é peça-chave de retenção, mas publicar e manter apps nativos nas lojas consome tempo no início.

## Decisão

Lançar o app do paciente como **PWA** dentro do mesmo projeto Next.js (instalável, com notificações push e acesso por magic link). Migrar para app nativo com **Expo/React Native** quando houver necessidade comprovada (push no iOS, câmera, offline, presença nas lojas).

## Consequências

- Um único código e deploy no início.
- Limitações de push e recursos nativos em alguns dispositivos iOS.
- Manter a lógica de negócio fora dos componentes (em `nutrition-core` e no backend) para reaproveitar no app nativo.
