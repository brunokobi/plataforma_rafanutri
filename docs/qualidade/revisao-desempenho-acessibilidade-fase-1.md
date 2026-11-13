# Revisão de desempenho e acessibilidade da Fase 1 (RN-048)

- **Data:** 13/11/2026, no site publicado (`rafanutri.brunokobi.tech`), navegador Chromium.
- **Ferramenta:** o Lighthouse não pôde ser usado nesta revisão (o controle de permissões do Claude Code bloqueou baixar o pacote com `npx`). No lugar, uma auditoria equivalente no próprio navegador do Playwright: métricas de navegação (TTFB, carga total, LCP) e checagens automáticas de acessibilidade. Para rodar o Lighthouse depois: `npx lighthouse@13.6.0 <url> --only-categories=performance,accessibility`.

## Desempenho

| Tela | TTFB | Carga | LCP |
|---|---|---|---|
| Página inicial | 346 ms | 415 ms | 1,09 s |
| Login | 337 ms | 1,17 s | 0,50 s |
| Anamnese pública | 351 ms | 1,17 s | 0,40 s |
| Painel (`/app`) | 620 ms | 0,80 s | 0,68 s |
| Pacientes | 357 ms | 1,19 s | 0,44 s |
| Agenda | 374 ms | 1,20 s | 0,44 s |
| Editor de plano | 354 ms | 1,18 s | 0,42 s |
| Alimentos | 327 ms | 1,14 s | 0,40 s |
| Questionários | 311 ms | 1,12 s | 0,36 s |

Todas abaixo de 2,5 s de LCP (faixa "bom" do Core Web Vitals). O painel, que faz mais consultas, carrega em cerca de 0,7–0,9 s com o cache quente (meta do RN-039: 1,5 s).

## Acessibilidade

Checado em todas as telas acima:

| Item | Resultado |
|---|---|
| Idioma da página (`lang="pt-BR"`) | ok em todas |
| Região principal (`<main>`) | ok em todas |
| Campos sem rótulo | nenhum |
| Botões e links sem nome acessível | nenhum |
| Imagens sem texto alternativo | nenhuma |
| Um `h1` por tela e títulos sem pular nível | **corrigido:** a anamnese pública sem link válido não tinha `h1`; no editor de plano as refeições eram `h3` antes dos `h2` (viraram `h2`) |
| Teclado no editor de plano | controles são botões e campos nativos (focáveis por Tab); Enter na busca adiciona o primeiro resultado (teste de componente). A simulação de teclado do Playwright não funcionou nesta sessão, então a navegação real por teclado e o leitor de tela ficam para um teste manual |

## Pendências

- Rodar o Lighthouse (perfil celular) para as notas oficiais quando a permissão for liberada.
- Teste manual com leitor de tela (NVDA ou VoiceOver) na anamnese pública.
- Consultas lentas no Postgres (`pg_stat_statements` não está habilitado); hoje nenhuma tela passa de 1,2 s.
