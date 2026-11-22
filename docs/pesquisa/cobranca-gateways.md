# Cobrança: avaliação da Cobre Fácil (e alternativas)

> **Decisão (22/11/2026):** sem CNPJ, a assinatura passa a usar a **InfinitePay** (pessoa física, sem mensalidade, Pix grátis, Checkout Integrado com aviso de pagamento). Implementada na migração 0070 (ver db/README). Alternativas só com CPF: Mercado Pago (Pix 0,99%) e Efí Pro (Pix 1,19%). Para o nutricionista receber na própria conta com comissão da plataforma, a opção com CPF é o Mercado Pago Marketplace (OAuth), a validar.

Pesquisa de 22/11/2026, só com páginas públicas (sem conta, sem dados enviados). O que não tinha fonte pública está marcado como **não confirmado**.

Dois usos avaliados:

- **(A)** cobrar as assinaturas da Rafanutri (mensal e anual com 50% de desconto) **sem recorrência automática**: uma cobrança avulsa por período, webhook de pago e plano liberado sozinho. Hoje: Pix direto na chave da plataforma, com confirmação do admin (migrações 0059 e 0069).
- **(B)** cada **nutricionista** gerar cobranças para os **pacientes** (consultas e pacotes) pelo sistema, recebendo **na conta dele**.

## Resumo

| Uso | Cobre Fácil | Recomendação |
|---|---|---|
| (A) Assinaturas da plataforma | Funciona no plano PRO (R$ 49,90/mês + R$ 0,99 por Pix) | **Usar com ressalvas**; Asaas ou Efí entregam o mesmo sem mensalidade, com sandbox aberto |
| (B) Nutricionista cobra o paciente | Sem subcontas, white label nem OAuth; split só em boleto e para até 2 contas Cobre Fácil | **Não usar**. Asaas (subcontas por API) ou Mercado Pago (OAuth de marketplace) |

Escolha sugerida: **Asaas**, porque a mesma integração atende (A) e (B).

## Cobre Fácil: o que a API oferece

Fonte principal: [developers.cobrefacil.com.br](https://developers.cobrefacil.com.br/) e [api-de-pagamento](https://www.cobrefacil.com.br/api-de-pagamento).

- `POST /v1/authenticate` com `app_id` e `secret` devolve um token Bearer de cerca de 1 hora. As credenciais ficam no painel da conta.
- Clientes (CRUD) e cobranças avulsas (`POST /v1/invoices`) por Pix (copia e cola e QR), boleto ou cartão, de R$ 10,00 a R$ 20.000,00. Juros, multa e desconto são aceitos. O cancelamento só vale para cobrança pendente.
- Carnê, planos e mensalidades (recorrência), NFS-e integrada e estorno (só de cartão).
- Webhooks cadastrados **no painel**, com reenvio a cada 10 minutos até 6 vezes.
  - Eventos: `invoice.created`, `.paid`, `.canceled`, `.refunded` e outros.
  - **Não há evento de vencimento.**
  - **Não há assinatura documentada:** é preciso reconsultar `GET /invoices/{id}` antes de liberar qualquer coisa.
- **Sandbox** só a pedido. Limites de requisição e SDK: **não confirmados**. Boleto com Pix na mesma cobrança: **não confirmado**.

### Tarifas ([planos](https://www.cobrefacil.com.br/planos))

| Item | Básico (grátis) | PRO (R$ 49,90/mês) |
|---|---|---|
| Pix | indisponível | R$ 0,99 |
| Boleto pago | R$ 3,50 | R$ 1,90 |
| Cartão | 4,14% | 2,12% + 1,99% por parcela |
| Recebimento | 30 dias | 10 dias |

Pontos a confirmar:
- O Básico aparece como grátis "pra sempre" e como "6 primeiros meses".
- Taxa de saque e prazo do Pix: **não confirmados**.

### Por que não serve para o (B)

- Não há conta-mãe, subcontas, white label nem OAuth.
- O split é só de boleto, para até 2 recebedores, e cada um precisa de conta Cobre Fácil ativa.
- Restaria cada nutricionista:
  - abrir conta própria (KYC com documento, selfie e comprovantes; pessoa física pode);
  - assinar o PRO para ter Pix;
  - colar `app_id` e `secret` na Rafanutri;
  - cadastrar o webhook à mão.
- Os termos tratam a senha como pessoal e intransferível, o que pede confirmação para um SaaS operar com a credencial de terceiros.

### Riscos

- **Documentação:** página única, com exemplo errado, sem SDK e sem sandbox aberto.
- **Retenção de saldo:** os termos permitem reter valores por até 180 dias.
- **Reputação:** 192 reclamações no Reclame Aqui em jan–jun de 2026 (transferência bloqueada, cobrança duplicada).
- **Intermediação:** a intermediação financeira é da Zoop.
- **LGPD:** sem DPA público.
- **Dados de paciente:** se integrar, mandar só nome, CPF, e-mail e valor; nunca dado clínico na descrição.

## Alternativas (só o que muda a decisão)

- **Asaas:**
  - [Subcontas por API](https://docs.asaas.com/docs/creating-subaccounts) (`POST /v3/accounts` devolve `apiKey` e `walletId`, com webhook por subconta); pessoa física pode ser subconta.
  - Pix e boleto a partir de R$ 0,99, sem mensalidade.
  - Régua por e-mail, SMS e WhatsApp e sandbox aberto.
  - Ressalvas: a conta-mãe precisa de CNPJ, há taxa por subconta e limites regulatórios no início.
- **Mercado Pago:** [marketplace com OAuth](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace). O dinheiro cai na conta do vendedor e a comissão vai em `application_fee`. Pix nesse modelo: não confirmado.
- **Efí:** API Pix madura e barata, boa para (A). O split só vale entre contas Efí.

## Desenho sugerido

**(A), em cima do que já existe (0059/0069):**
1. Credenciais do gateway no `.env` do Directus.
2. Mapear o cliente do gateway por consultório.
3. A fatura atual (mensal ou anual) cria a cobrança no gateway e guarda `gateway` e `gateway_id`; as colunas já existem em `subscription_invoices`.
4. Webhook `POST /rafanutri/billing/webhook/<token>`: grava o evento sem duplicar, reconsulta a cobrança e, se paga, executa a mesma rotina da confirmação do admin.
5. Rotina diária para vencidos, porque não há evento de vencimento, e para conferir o que ficou pendente.

**(B), com Asaas e subcontas:**
1. No onboarding do consultório, criar a subconta com o CNPJ ou CPF do nutricionista. A `apiKey` fica criptografada e o webhook é próprio.
2. `patient_charges` (consultório, paciente, consulta ou pacote, valor, método, status, id no gateway) ligada ao financeiro e aos pacotes que já existem.
3. Webhook por consultório, que reconsulta a cobrança e dá baixa no lançamento financeiro.
4. Isolamento por consultório nas tabelas novas, com entrada no teste de isolamento.

## Perguntas para o comercial da Cobre Fácil

1. Existe conta-mãe, subconta, white label ou OAuth de parceiro?
2. O split funciona com Pix e cartão? Com mais de 2 recebedores?
3. Boleto com Pix na mesma cobrança, e link de pagamento com Pix?
4. Sandbox, limites de requisição e assinatura dos webhooks? Webhook por API? Evento de vencido?
5. A API está no plano Básico? O Básico é grátis para sempre?
6. Taxa de saque, prazo do Pix e critérios de retenção de saldo?
7. Contrato de tratamento de dados (LGPD), hospedagem e papel da Zoop?
8. Os termos permitem um SaaS operar com a credencial de contas de terceiros?
