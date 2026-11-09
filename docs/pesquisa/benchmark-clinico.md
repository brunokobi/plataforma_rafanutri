# Benchmark — softwares de nutrição clínica no Brasil

Referências usadas para desenhar o Módulo Clínico. Fonte: levantamento trazido pelo time em 09/11/2026. Preços e funcionalidades mudam com frequência, então reconfirmar nos sites antes de usar em material comercial.

## Concorrentes

| Produto | Posicionamento | Destaques citados | Preço de referência |
|---|---|---|---|
| **Dietbox** | Mais popular do país, completo | Cálculo de dietas, anamnese interativa, agenda online, videoconferência, app do paciente com diário alimentar, IA para montar planos | A partir de cerca de R$ 49,90/mês nos primeiros meses |
| **WebDiet** | Foco em prescrição | Mais de 100 modelos de métodos, WhatsApp Connect, agenda sincronizada com o Google, Body3D (antropometria por fotos no celular) | Plano anual a partir de cerca de R$ 49/mês |
| **Avanutri Online** | Tradicional em avaliação nutricional e física | Mais de 54 indicadores antropométricos, mais de 10.000 alimentos, análise de exames laboratoriais, protocolos por público (gestantes, atletas, idosos), app do paciente | — |
| **Nutrium** | Acompanhamento em tempo real | Envio de planos personalizados, relatórios de evolução, engajamento do paciente | — |
| **DietSystem** | "Tudo em um" com IA | Assistente de voz, leitura de exames em PDF por IA, check-ins pelo WhatsApp, Body Scan por fotos, carteira financeira (Wallet) | — |
| **Amplimed** | Gestão clínica multiprofissional | Prontuário eletrônico, agendamento online, teleconsulta, faturamento TISS, Ampli IA | — |
| **DietSmart** | Instalação local (Windows), offline | Funciona sem internet | — |

## O que o mercado já considera básico

Sem isso, o nutricionista não troca de ferramenta. Tudo está coberto no MVP (Fases 1 e 1B):

| Funcionalidade básica | Na Rafanutri |
|---|---|
| Cadastro de pacientes, agenda e prontuário | RN-020, RN-022, RN-023 |
| Anamnese interativa enviada ao paciente | RN-025, RN-026 |
| Antropometria e composição corporal com gráficos | RN-027, RN-028 |
| Cálculo de gasto energético e prescrição com tabelas brasileiras | RN-029 a RN-033 |
| Substituições e modelos de plano | RN-034, RN-035 |
| PDF do plano com a marca do profissional | RN-036 |
| Acesso do paciente ao plano pelo celular | RN-203 a RN-209 |

## Onde a Rafanutri se diferencia

| Diferencial | Por que importa | Onde está no plano |
|---|---|---|
| **Plano gratuito permanente com 20 pacientes** | Os concorrentes cobram desde o primeiro mês (no máximo com desconto inicial). Remove a barreira de entrada do recém-formado | Fase 1B |
| **Receitas e recomendações na área do paciente** | O paciente recebe receitas com foto e orientações individuais, além do plano | RN-206 a RN-208 |
| **Velocidade do editor de plano (teclado)** | Meta de plano completo em menos de 10 minutos | RN-031, RN-032 |
| **Plataforma com módulo UAN** | Nenhum dos clínicos citados atende a nutricionista que também faz consultoria para restaurantes | [Módulo UAN](../modulos/uan.md) |
| **IA que sugere usando só alimentos da base, com cálculo determinístico** | Evita números inventados pelo LLM, um problema comum em "IA de dieta" | RN-075 |

## Lacunas encontradas e decisão

Funcionalidades dos concorrentes que ainda não estavam no plano, ou estavam fracas:

| Funcionalidade (quem tem) | Decisão | Onde entra |
|---|---|---|
| Modelos de métodos de prescrição: low carb, cetogênica, mediterrânea, DASH, vegetariana, jejum intermitente etc. (WebDiet, mais de 100) | **Entra no MVP** como seed de modelos de plano e de distribuição de macros | RN-035 (acrescentar a biblioteca de 15 a 20 métodos validados pela nutricionista) |
| Protocolos por público: gestante, atleta, idoso (Avanutri) | Gestante na Fase 4; atleta e idoso entram como presets de fórmulas e metas | RN-030 (presets) e Fase 4 |
| Mais indicadores antropométricos (Avanutri, mais de 54) | Expandir aos poucos a partir do MVP: área muscular do braço, circunferência muscular do braço, índice de conicidade, RCEst, % de perda de peso | RN-027 (lote 2 depois do beta) |
| Análise de exames laboratoriais (Avanutri) e leitura de exames em PDF por IA (DietSystem) | Exames na Fase 6; leitura de PDF por IA como evolução | RN-185, RN-186 + item novo da Fase 6 |
| Videoconferência e teleconsulta (Dietbox, Amplimed) | MVP usa link externo (Meet, Zoom); videochamada própria fica fora de escopo | RN-022 (campo de link) |
| Agenda sincronizada com o Google (WebDiet) | Já previsto | RN-058 (Fase 2) |
| Check-in e lembretes pelo WhatsApp (WebDiet, DietSystem) | Lembretes na Fase 2; check-in semanal do paciente pelo WhatsApp como evolução | RN-051, RN-052 + item novo da Fase 2/3 |
| Diário alimentar no app (Dietbox) | Já previsto | RN-073 (Fase 3) |
| Avaliação por fotos: Body3D, Body Scan (WebDiet, DietSystem) | Fora do MVP. Fotos de evolução simples já estão no RN-028; estimativa de medidas por foto exige pesquisa | Fase 6, pesquisa |
| Assistente de voz (DietSystem) | Fora do MVP. Possível reaproveitar o Whisper que já roda na vpsrafa para transcrever a consulta e gerar a evolução | Fase 6, pesquisa |
| Financeiro integrado (DietSystem, Amplimed) | Já previsto | RN-053 a RN-055 (Fase 2) |
| Faturamento TISS (Amplimed) | Fora do escopo: convênios são um nicho pequeno na nutrição | — |
| Funcionamento offline em PC (DietSmart) | Fora do escopo. A área do paciente terá cache offline (Fase 3) | — |

## Respostas às perguntas de posicionamento

| Pergunta | Resposta para o MVP |
|---|---|
| Atendimento presencial, online ou híbrido? | **Híbrido**: a consulta tem modo presencial ou online (RN-022), anamnese por link antes da consulta (RN-026) e o paciente acompanha pela área própria (Fase 1B) |
| Precisa de app do paciente? | Sim, primeiro como área web mobile (Fase 1B), depois PWA instalável (Fase 3) |
| Precisa de notas e finanças? | Finanças na Fase 2 (recebimentos, pacotes e recibo). Nota fiscal fora do escopo inicial |
