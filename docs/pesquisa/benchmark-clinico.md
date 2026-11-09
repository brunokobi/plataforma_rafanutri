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

---

## Análise 2 — artigo de mentora de nutricionistas (Andryely Pedroso)

Artigo de uma nutricionista clínica que usa o Dietbox e mentora recém-formados. Ele mostra **como a usuária escolhe** a ferramenta e traz preços e limites concretos.

### Preços e planos gratuitos dos concorrentes

| Produto | Preço citado | Gratuito / teste |
|---|---|---|
| Dietbox | R$ 59,90/mês; R$ 199/mês acima de 3.000 pacientes | Teste grátis com até **5 pacientes** |
| WebDiet | R$ 49/mês no plano anual; também mensal, trimestral, semestral | **Grátis para estudantes** até a formatura, com limite de **20 pacientes** e comprovante de matrícula |
| Nutrium | ~R$ 480/ano (~R$ 40/mês, "Plano alimentar"); ~R$ 720/ano (~R$ 60/mês, "Acompanhamento") | — |
| DietSmart | Mensal, semestral, anual (instalação local, offline) | — |
| DietOne Open License | Gratuito, sem suporte, só Windows 10 | Gratuito |

**Conclusões**
1. **Nossa referência de preço está alta.** O mercado cobra de R$ 40 a R$ 60/mês, e nós havíamos estimado R$ 79 a R$ 190. Ajuste: Essencial entre R$ 49 e R$ 59/mês, com desconto no plano anual. Profissional (com IA e WhatsApp) entre R$ 89 e R$ 119/mês. Validar com entrevistas.
2. **O plano gratuito com 20 pacientes continua sendo um diferencial forte.** O WebDiet dá 20 pacientes, mas só para estudantes e até a formatura. O Dietbox dá 5. O nosso é para qualquer nutricionista e não expira. O argumento de venda é: "comece de graça, e quando passar de 20 pacientes você já está faturando".
3. **O recém-formado é o público de entrada.** O artigo diz que o recém-formado testa vários softwares e decide pela opinião de colegas e mentoras. Ações: parceria com mentoras e cursos de nutrição; programa de indicação (vagas extras de pacientes para quem indicar outro nutricionista, a avaliar).

### O que a usuária valoriza (e o que fazer)

| O que o artigo destaca | Situação no plano | Ação |
|---|---|---|
| Cálculos: VET, macronutrientes, IMC, % de gordura | MVP (RN-027 a RN-032) | Mantido |
| **Protocolo ISAK** para antropometria ("cada nutricionista adota uma equação e mantém para comparar avaliações") | Faltava | **Entra no MVP**: perfil restrito ISAK (8 dobras: tríceps, subescapular, bíceps, crista ilíaca, supraespinal, abdominal, coxa e panturrilha, mais perímetros), somatório de 6 e de 8 dobras como indicador principal de evolução, e **protocolo padrão por organização e por paciente**, para manter a comparação entre avaliações (RN-027 e RN-028) |
| Paciente acessa plano, prescrições e receitas no app | MVP (Fase 1B) | Mantido; é o motivo de escolha citado |
| Muitas tabelas de alimentos e cadastro de alimentos e preparações próprios | MVP (RN-011, RN-012, RN-041, RN-042) | Mantido |
| Logo no painel e nos documentos | MVP (RN-006, RN-036) | Mantido |
| **Documentos clínicos impressos**: prescrição de suplemento manipulado, pedido de exames | Suplementos só na Fase 6 | **Novo item RN-215 (Fase 1B)**: modelos de documentos com a marca (pedido de exames, prescrição de suplementos e manipulados em texto livre, declaração de comparecimento, orientações), também visíveis na área do paciente |
| **Lâminas educativas** que servem de conteúdo para redes sociais | Fase 6 (RN-189, RN-190) | Antecipar parte: as recomendações (RN-208) já podem ser exportadas como imagem com a marca (P2) |
| Agendamento online, site e blog do nutricionista (Nutrium) | Faltava | **Novo item RN-068 (Fase 2)**: página pública do nutricionista com agendamento online pelos horários livres da agenda |
| Integração com videochamada (Nutrium) | Link externo (RN-022) | Mantido; gerar link do Google Meet automaticamente quando houver a integração com o Google (RN-058) |
| Lembretes de consulta, atividade física, água, registro de peso no app, chat, diário com cálculos (Nutrium "Acompanhamento") | Fases 2 e 3 | Mantido. Confirma a divisão comercial: plano básico (prescrição) e plano de acompanhamento (app completo) |
| **Nutrição comportamental / alimentação intuitiva**: parte dos nutricionistas não usa plano com números | Faltava | **Entra no MVP como modo do editor** (RN-031): plano qualitativo, sem quantidades e sem calorias, com orientações e escalas de fome e saciedade. Isso amplia o público para quem hoje usa Excel |
| Funcionamento offline e instalação local (DietSmart, DietOne) | Fora do escopo | Mantido fora |
| Gestão do negócio: faturamento, investimentos, impostos | Fase 2 (financeiro) | Mantido; impostos e investimentos ficam fora |

### Ajustes feitos no plano a partir desta análise

- `docs/01-visao-produto.md`: faixas de preço revisadas.
- RN-027 e RN-028: perfil ISAK, somatórios de dobras e protocolo padrão por organização e paciente.
- RN-031: modo de plano qualitativo (comportamental).
- RN-215 (novo, Fase 1B): documentos clínicos com a marca.
- RN-068 (novo, Fase 2): página pública com agendamento online.
