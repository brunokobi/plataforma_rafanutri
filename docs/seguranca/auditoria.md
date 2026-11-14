# Auditoria (RN-009)

O que fica registrado, quem vê e por quanto tempo.

## O que é registrado

| Ação | Quando |
|---|---|
| Criou, alterou, excluiu | Qualquer escrita em pacientes, evoluções do prontuário, anamneses, avaliações, planos alimentares, documentos clínicos, consultas, lançamentos financeiros, recibos, equipe, convites do paciente, recomendações e pacotes do paciente. Vale para a tela, a API e os gatilhos do banco. |
| Abriu | Leitura das evoluções do prontuário de um paciente. |
| Exportou | Geração do PDF de documento clínico e de recibo. |

Cada linha guarda: consultório, pessoa, ação, tipo e id do item, paciente (quando houver), **nomes** dos campos alterados e horário. **Nunca o conteúdo**: o log não vira uma segunda cópia do prontuário.

A mesma ação da mesma pessoa no mesmo item, com os mesmos campos, em até 10 minutos, vira uma linha só (salvamento automático, reabrir a mesma aba).

Escritas sem login (paciente respondendo a anamnese pelo link, agendamento online, rotinas automáticas) aparecem como "Sem login".

## Quem vê

Só o **owner** do consultório, em Consultório → Auditoria (`/app/configuracoes/auditoria`), e só do próprio consultório. Nutricionistas e assistentes não veem. Nenhum papel lê a tabela pela API de itens do Directus. Ninguém altera nem apaga registros; eles só somem quando o consultório inteiro é excluído.

## Não registrado ainda

- Leitura de ficha, anamnese, avaliação e plano pela API de itens (o Directus não registra leituras). Só o prontuário (evoluções) tem leitura registrada.
- O PDF do plano alimentar é gerado no navegador e não passa pelo servidor.

## Retenção

Indefinida até a decisão do jurídico (pendente com o RN-016, Termos e Política de Privacidade). O prazo deve acompanhar o de guarda do prontuário definido pelo jurídico; o expurgo, quando houver, será uma rotina agendada.
