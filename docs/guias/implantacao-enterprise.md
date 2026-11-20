# Roteiro de implantação Enterprise (UAN)

Passo a passo para colocar uma empresa cliente na UAN da Rafanutri. Tudo é feito pela plataforma, sem
painel do Directus. O que depende do admin da Rafanutri está marcado **(admin)**.

## 1. Contrato e módulo (admin)

1. A empresa cria a conta e o consultório (`/onboarding`) com o tipo "empresa".
2. **(admin)** Habilitar o módulo e o contrato por SQL na vpsrafa:
   ```sql
   update organizations set modules = array_append(modules, 'uan') where id = '<empresa>' and not 'uan' = any(modules);
   insert into organization_contracts (organization_id, plan, units_contracted, monthly_price_cents, starts_at, ends_at, billing_method)
   values ('<empresa>', 'uan_quality', 3, 49900, current_date, null, 'boleto');
   ```
   Sem contrato a empresa fica no piloto (1 unidade). Contrato encerrado deixa a UAN em modo leitura por 90 dias.
3. **(admin)** Faturas, até integrar o gateway: `insert into contract_invoices (contract_id, period_start, period_end, amount_cents, due_on, payment_url) values (...)`.
   O owner acompanha em **UAN › contrato**.

## 2. Unidades e equipe

1. Em **UAN e Qualidade**, o owner cria as unidades (endereço, CNPJ, localização para o raio dos checklists).
2. Em cada unidade, convida a equipe por link: RT, gestor, cozinheiro, estoquista, auditor.
3. Cadastra os equipamentos de frio e calor (limites padrão por tipo) e imprime as etiquetas com QR Code.

## 3. Cadastros por planilha (**UAN › Importar planilhas**)

Ordem recomendada (cada passo usa o anterior):

1. **Fornecedores**: nome, CNPJ, contato, telefone, e-mail.
2. **Insumos**: nome, categoria, unidade de compra (kg, g, L, mL, un, dz, cx, pct), armazenamento, FC, densidade,
   peso da unidade ou da embalagem, estoque mínimo, alergênicos (separados por `|`), açúcar adicionado, fornecedor,
   preço e o alimento da TACO. Sem a coluna `taco`, a plataforma sugere o alimento pelo nome (a RT confere depois em
   **Insumos**).
3. **Fichas técnicas**: uma linha por ingrediente (`ficha; categoria; porcoes; peso_pronto_g; insumo; peso_bruto_g; fc`).
   Entram como rascunho; a RT revisa e aprova cada uma.

Regras do importador: CSV com `;`, `,` ou tabulação (no Excel, "Salvar como › CSV"); até 1.000 linhas por arquivo;
cada linha entra ou volta com o motivo (o resto não é afetado); nome já cadastrado é ignorado; ficha com uma linha
inválida não entra pela metade. Ao fim, **Baixar relatório** lista o que não entrou.

## 4. Qualidade (BPF)

1. **Checklists**: personalizar os modelos da biblioteca (RDC 216, abertura da cozinha, higiene dos manipuladores)
   e montar a agenda por unidade.
2. **Documentos**: gerar os 4 POPs a partir dos modelos, revisar com a RT, aprovar e pedir a ciência da equipe.
3. **Treinamentos**: registrar a capacitação inicial (certificados em PDF).
4. **Fiscalização**: registrar alvará, certificado de pragas e limpeza do reservatório; emitir o Manual de Boas
   Práticas (edição 1).
5. **APPCC** (se o contrato incluir): um plano por preparação crítica a partir da ficha técnica.

## 5. Cardápio, produção e compras

1. **Perfis e regras**: copiar o perfil (PAT, PNAE…), revisar as metas com a RT e cadastrar as regras do contrato.
2. **Cardápios** por unidade: ciclo, perfil, modelo (padronizado, descentralizado, livre), aprovação.
3. **Cardápio público**: publicar o link, imprimir o QR Code, abrir a pesquisa de satisfação.
4. **Produção**: comensais previstos e realizados, lista de preparo, sobra e resto-ingesta.
5. **Estoque e compras**: inventário inicial (contagem cega), necessidade de compra, pedidos e recebimento.

## 6. Acompanhamento do piloto

- Painel de conformidade semanal com o cliente (índice, pendências documentais).
- Custos planejado × realizado e curva ABC no fim do primeiro mês.
- Dossiê do período quando houver visita da vigilância sanitária.

Pendências que dependem de definição externa: avisos por WhatsApp/e-mail (n8n), cobrança no gateway, IA e a
validação pela RT dos textos-base e critérios marcados "a validar".
