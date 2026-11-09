# 02 — Módulos da plataforma

A plataforma é dividida em módulos por área de atuação, sobre um **núcleo comum** (contas, pacientes, agenda, documentos, IA). Cada módulo pode ser habilitado por plano.

Legenda de prioridade: **P0** = MVP, **P1** = logo após o MVP, **P2** = fase posterior.

## Núcleo comum (Core)

| Funcionalidade | Prioridade |
|---|---|
| Cadastro e login (e-mail/senha, Google), recuperação de senha | P0 |
| Organização (consultório/clínica/empresa) com membros e papéis | P0 |
| Cadastro de pacientes com termo de consentimento LGPD | P0 |
| Plano gratuito: até 20 pacientes ativos por nutricionista | P0 (Fase 1B) |
| Agenda de consultas (presencial/online, retorno) | P0 |
| Prontuário com linha do tempo de atendimentos | P0 |
| Geração de PDF com a identidade visual do profissional | P0 |
| Base de alimentos (TACO, TBCA e alimentos próprios) | P0 |
| Auditoria de acesso a dados sensíveis | P0 |
| Notificações (e-mail, WhatsApp via n8n) | P1 |

## 1. Clínico e Nutrição Esportiva — **prioridade comercial nº 1**

| Funcionalidade | Prioridade |
|---|---|
| Anamnese com questionários customizáveis e link pré-consulta | P0 |
| Antropometria: peso, estatura, circunferências, dobras cutâneas | P0 |
| Composição corporal: % gordura (protocolos Jackson & Pollock, Durnin & Womersley, Faulkner etc.), massa magra, gráficos de evolução | P0 |
| Cálculo de gasto energético (Harris-Benedict, Mifflin-St Jeor, Cunningham, FAO/OMS) | P0 |
| Prescrição dietética por refeição com cálculo de calorias, macro e micronutrientes | P0 |
| Substituições de alimentos por equivalência nutricional | P0 |
| Modelos de plano alimentar reutilizáveis | P0 |
| Lista de compras gerada a partir do plano | P1 |
| Exames laboratoriais com valores de referência | P1 |
| Somatotipo (Heath-Carter) | P2 |
| Suplementação e fitoterápicos com alertas de interação droga-nutriente | P2 |

## 2. Materno-Infantil e Pediatria

| Funcionalidade | Prioridade |
|---|---|
| Curvas de crescimento da OMS (peso/idade, estatura/idade, IMC/idade, perímetro cefálico) com escore-z e alertas | P1 |
| Acompanhamento de gestantes: ganho de peso gestacional por IMC pré-gestacional | P1 |
| Recomendações para gestação e lactação | P2 |
| Guia de introdução alimentar (BLW, tradicional, participativa), alimentos alergênicos e progressão de texturas | P2 |

## 3. Nutrição Comunitária e Saúde Pública

| Funcionalidade | Prioridade |
|---|---|
| Triagem nutricional rápida (NRS-2002, MNA, MUST) | P1 |
| Grupos/programas (hipertensos, diabéticos, gestantes) com indicadores coletivos | P2 |
| Relatórios epidemiológicos por território | P2 |
| Integração com prontuários (SUS/privados, padrões como FHIR) | P2 |

## 4. UAN e Gestão de Qualidade — **prioridade comercial nº 2 (Enterprise)**

Plano completo do módulo em [modulos/uan.md](modulos/uan.md).

| Funcionalidade | Prioridade |
|---|---|
| Ficha Técnica de Preparação: ingredientes, peso bruto/líquido, fator de correção, índice de cocção, rendimento, custo, informação nutricional | P1 (Enterprise) |
| Cardápio cíclico com per capita e número de refeições | P1 (Enterprise) |
| Lista de compras automática (necessidade de insumos a partir do cardápio) | P1 (Enterprise) |
| Estoque: entradas, saídas, validade, inventário | P2 |
| Checklists digitais: temperatura de equipamentos, recebimento de gêneros, higiene de manipuladores, com foto e assinatura | P1 (Enterprise) |
| Não conformidades e planos de ação | P1 (Enterprise) |
| Manual de Boas Práticas e POPs (RDC 216/2004) com versionamento e aprovação | P2 |
| APPCC: mapeamento de perigos e pontos críticos de controle | P2 |
| Rotulagem nutricional (RDC 429/2020 e IN 75/2020) a partir da ficha técnica | P2 |

## 5. Empreendedorismo e Gestão do Consultório

| Funcionalidade | Prioridade |
|---|---|
| Lembretes automáticos de consulta e retorno (WhatsApp/e-mail) | P1 |
| CRM: funil de pacientes (lead → primeira consulta → acompanhamento → inativo) | P1 |
| Financeiro: recebimentos, pacotes de consultas, fluxo de caixa, recibos | P1 |
| Cobrança online (Pix/cartão via gateway) | P2 |
| Gerador de conteúdo educativo (posts, e-books) com a identidade visual | P2 |

## Diferenciais transversais

### Assistente de IA
| Funcionalidade | Prioridade |
|---|---|
| Sugestão de plano alimentar a partir de metas, restrições e preferências (sempre revisado pelo nutricionista) | P1 |
| Resumo da anamnese e do histórico do paciente | P1 |
| Assistente RAG sobre diretrizes clínicas e tabelas de composição | P2 |
| Sugestão de receitas com base no plano do paciente | P2 |

Regra: a IA **sugere**, o nutricionista **decide**. Nada gerado por IA chega ao paciente sem revisão do profissional.

### App do paciente
| Funcionalidade | Prioridade |
|---|---|
| Ver plano alimentar do dia e substituições | P1 |
| Marcar refeições realizadas (diário alimentar) | P1 |
| Meta de hidratação | P1 |
| Lista de compras | P1 |
| Chat com o nutricionista | P2 |
| Fotos das refeições | P2 |
| Responder anamnese e questionários | P0 (via link web) |
| Área do paciente (web mobile) com plano publicado, receitas e recomendações | P0 (Fase 1B) |
