# Spec — Cadastro (`/cadastro`) e onboarding (`/onboarding`)

- **Status:** gravação **ligada** em 10/11/2026 (`SIGNUP_OPEN=true` no Coolify). Cadastro, onboarding e redirecionamentos funcionam contra o Directus da vpsrafa
- **Relacionado:** [Fase 0](../plano/fase-0-fundacao.md) (RN-005, RN-006), [Fase 1B](../plano/fase-1b-freemium-area-paciente.md) (plano gratuito), [ADR 0008](../adr/0008-backend-directus.md)

## 1. Objetivo

Levar um nutricionista do primeiro clique até um consultório configurado no plano gratuito, em menos de 3 minutos.

## 2. Cadastro (`/cadastro`)

**Layout:** igual ao login. No computador, formulário à esquerda e a cena parallax à direita. No celular, a cena vira fundo com o formulário num card translúcido.

**Campos:**

| Campo | Regra |
|---|---|
| Nome completo | Obrigatório, de 3 a 120 caracteres, com nome e sobrenome |
| E-mail | Obrigatório, e-mail válido |
| Senha | Mínimo de 8 caracteres, com ao menos uma letra e um número. Indicador de força e lista de requisitos ao vivo |
| Confirmar senha | Igual à senha |
| Aceite | Obrigatório: Termos de uso e Política de privacidade (links) |

**Envio:**
- O mesmo schema Zod valida no cliente e na Server Action.
- **Chave `SIGNUP_OPEN` desligada (padrão):** nada é gravado. A tela mostra "O cadastro abre em breve. Seus dados não foram salvos." e oferece o login.
- **Chave ligada:** chama o registro público do Directus (`registerUser`; novos usuários recebem o papel **Profissional**). **A verificação por e-mail está desligada** enquanto o Directus não tiver servidor de e-mail: a conta já nasce ativa, o app faz o login automático e leva ao `/onboarding`. E-mail já cadastrado mostra "Cadastro recebido, entre com seu e-mail e senha", sem confirmar que o e-mail existe. Quando houver SMTP: ligar `public_registration_verify_email` no Directus, criar a rota `/cadastro/verificar` (`registerUserVerify`) e voltar a mensagem "Confira seu e-mail".

## 3. Onboarding (`/onboarding`)

Exige sessão. Assistente em 4 etapas, com barra de progresso e voltar/avançar:

| Etapa | Campos | Regras |
|---|---|---|
| 1. Seu perfil | Nome profissional; número do CRN; regional (CRN-1 a CRN-11) | CRN numérico de 1 a 6 dígitos; regional obrigatória |
| 2. Seu consultório | Nome do consultório; tipo (atendo sozinho / clínica com equipe); cor da marca (paleta + seletor); logo (opcional, PNG/JPG/SVG até 2 MB) | Nome de 2 a 120 caracteres. A **pré-visualização** mostra o cabeçalho do PDF e a área do paciente com a marca escolhida |
| 3. Como você atende | Modalidade (presencial, online ou híbrido); áreas de atuação (múltipla escolha) | Ao menos uma modalidade |
| 4. Revisão | Resumo e plano **Gratuito** (até 20 pacientes ativos, 1 nutricionista) | Botão "Criar meu consultório" |

**Envio:**
- **Chave `SIGNUP_OPEN` desligada:** valida tudo e mostra "Pré-lançamento: o consultório ainda não é salvo". Nada é gravado.
- **Chave ligada:** chama o endpoint `POST /rafanutri/organizations` (extensão em `directus/extensions/rafanutri`), que cria organização, owner e perfil profissional numa transação (função `create_organization`, migração 0002) e redireciona para `/app`. É idempotente: reenviar não cria outro consultório.
- **Redirecionamentos:** em `/app`, quem não tem consultório vai para `/onboarding` (só com o cadastro aberto); em `/onboarding`, quem já tem vai para `/app`. Se o Directus falhar, ninguém é redirecionado.

**Logo:** fica só na memória do navegador até a Fase 0. O upload para os arquivos do Directus entra junto com a gravação.

## 4. Critérios de aceite

- [ ] Cadastro valida todos os campos com mensagens em português, abaixo de cada campo.
- [ ] Indicador de força da senha e lista de requisitos reagem enquanto a pessoa digita.
- [ ] Com `SIGNUP_OPEN` desligada, nenhum dado sai do servidor do app e a tela diz isso claramente.
- [ ] Onboarding não deixa avançar com a etapa inválida e mantém os dados ao voltar.
- [ ] A pré-visualização da marca muda na hora com o nome, a cor e o logo.
- [ ] As duas telas funcionam de 360 px a 1440 px, nos temas claro e escuro, por teclado.
- [ ] Sem sessão, `/onboarding` redireciona para `/login?next=/onboarding`.
