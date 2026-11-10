# Prompt — Tela inicial e tela de login (com parallax) + deploy no Coolify

> Prompt pronto para entregar a um agente de código (Claude Code ou outro). Ele cobre a primeira entrega visual da Rafanutri: a **página inicial pública** e a **tela de login** com efeito parallax, no monorepo deste repositório, publicadas no **Coolify da vpsrafa com deploy automático**.
>
> Referências do repositório que o agente deve ler antes: `README.md`, `docs/02-modulos.md`, `docs/01-visao-produto.md`, `docs/adr/0008-backend-directus.md` e `docs/runbooks/directus-vpsrafa.md`.

---

## Prompt

Você vai implementar a **página inicial pública** e a **tela de login** da **Rafanutri**, uma plataforma SaaS para nutricionistas (consultório, área do paciente e, no futuro, UAN/qualidade). Todo o código fica no monorepo `plataforma_rafanutri`, em TypeScript, e vai para produção no **Coolify** com deploy automático a cada push na `main`.

### 1. Regras gerais

- Interface, textos e mensagens de erro em **português do Brasil**. Código, nomes de arquivos e identificadores em **inglês**.
- **TypeScript estrito** (`strict`, `noUncheckedIndexedAccess`). Nada de `any` sem justificativa.
- Commits no padrão Conventional Commits, em português (ex.: `feat(web): tela de login com parallax`). **Não** adicione coautoria de IA nos commits.
- Nenhum segredo no repositório. Variáveis em `.env.example` sem valores reais.
- Antes de instalar qualquer pacote, confira a versão estável mais recente e **fixe a versão exata** no `package.json`.

### 2. Stack obrigatória

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo; app em `apps/web` |
| Framework | **Next.js 16** (App Router, Server Components, Server Actions, `output: 'standalone'`) |
| UI | **React 19**, **Tailwind CSS 4** (configuração via CSS, `@theme`), **shadcn/ui** (CLI 4) com componentes em `apps/web/components/ui` |
| Ícones | lucide-react |
| Animação e parallax | **Motion** (pacote `motion`, antigo Framer Motion): `useScroll`, `useTransform`, `useMotionValue` e `useSpring` |
| Formulários | React Hook Form + **Zod 4** (o mesmo schema valida no cliente e na Server Action) |
| Backend | **Directus 12** em `https://rafanutri-api.brunokobi.tech`, via `@directus/sdk` (linha 27) **somente no servidor** |
| Fontes | `next/font` (sugestão: uma sans moderna para texto, como Inter ou Geist, e uma display elegante para títulos) |
| Qualidade | ESLint 9 (flat config) ou Biome, Prettier, Vitest + Testing Library, Playwright para e2e |

Se o Next.js 16 tiver renomeado o `middleware.ts` para `proxy.ts`, use o nome atual da versão instalada e verifique na documentação oficial.

### 3. Identidade visual

- **Conceito:** saúde, frescor e confiança; visual comercial e premium, nada de template genérico.
- **Paleta:** verde da marca `#2E7D32` como primária, um verde-folha claro de apoio, neutros quentes (off-white e grafite) e um acento quente (laranja-pêssego) para destaques e CTAs secundários. Defina tudo como **tokens CSS** (`--primary`, `--background` etc.) no padrão do shadcn/ui, com **tema claro e escuro**.
- **Formas:** cantos arredondados generosos, sombras suaves e formas orgânicas (folhas, gotas) como elementos decorativos em SVG.
- **Contraste:** WCAG AA em todos os textos, inclusive sobre imagens.
- **Logo:** use um logotipo provisório em texto ("Rafanutri", com uma folha estilizada em SVG) até existir o definitivo.

### 4. Página inicial pública (`/`)

Página de apresentação comercial, focada em levar o nutricionista ao cadastro gratuito.

Seções, nesta ordem:
1. **Cabeçalho fixo** com logo, links âncora (Funcionalidades, Para o paciente, Planos, Perguntas frequentes) e botões "Entrar" e "Começar grátis". Menu em folha lateral (`Sheet`) no celular.
2. **Hero:** título forte ("Seu consultório de nutrição em um só lugar"), subtítulo sobre montar planos alimentares em minutos, CTA principal "Começar grátis, até 20 pacientes" e CTA secundário "Ver como funciona". À direita, uma composição com mockups do produto (cards de plano alimentar, gráfico de evolução e tela do paciente no celular) com leve parallax ao rolar a página.
3. **Faixa de confiança:** "Tabelas TACO e TBCA", "Protocolos ISAK", "Área do paciente", "Seus dados isolados por consultório".
4. **Funcionalidades** (grid de cards): anamnese por link, avaliação antropométrica e composição corporal, cálculo de gasto energético, editor de plano alimentar com substituições, PDF com a sua marca, receitas e recomendações para o paciente.
5. **Para o paciente:** mockup de celular com plano do dia, receitas e recomendações.
6. **Planos:** card "Gratuito: R$ 0, até 20 pacientes ativos, para sempre" em destaque, e cards "Essencial" e "Profissional" marcados como "em breve".
7. **Perguntas frequentes** (componente `Accordion`).
8. **CTA final** e **rodapé** (links de Termos e Privacidade como páginas provisórias, e contato).

Requisitos:
- **Não invente depoimentos, números de clientes ou logos de empresas.** Onde precisar de prova social, use texto neutro ou deixe um espaço marcado para preencher depois.
- **Animações de entrada** sutis (fade/slide ao entrar na tela) com Motion, todas desligadas com `prefers-reduced-motion`.
- **Desempenho:** Lighthouse acima de 90 em desempenho, acessibilidade, boas práticas e SEO no celular. LCP abaixo de 2,5 s. Imagens com `next/image`, AVIF/WebP e tamanhos responsivos.
- **SEO:** `metadata` completa, Open Graph com imagem, `robots.txt` e `sitemap.xml`.

### 5. Tela de login (`/login`) com parallax

**Layout**
- **Desktop (a partir de 1024 px):** duas colunas. À esquerda, o formulário num card limpo. À direita, ocupando cerca de 55% da largura, uma **cena parallax** de fundo comercial.
- **Celular:** a cena vira fundo de tela cheia, com uma sobreposição escura e desfoque. O formulário fica num card translúcido (glassmorphism discreto) por cima.

**Cena parallax (fundo comercial)**
- Composição em **camadas com profundidades diferentes**, da mais distante para a mais próxima:
  1. Gradiente da marca (verde profundo para verde-folha), com ruído sutil.
  2. Formas orgânicas desfocadas (bolhas de luz) em verde e pêssego.
  3. **Fotografia de alimentos frescos** (frutas, verduras, grãos, em composição flat lay ou mesa de consultório), recortada ou com máscara.
  4. Ingredientes isolados flutuando (folha de manjericão, fatia de limão, morango, amêndoas), em PNG/WebP com fundo transparente ou SVG.
  5. **Cards de interface flutuantes** que vendem o produto: "Plano alimentar: 1.850 kcal" com barras de macros, mini gráfico "Evolução: −4,2 kg em 8 semanas" e selo "Até 20 pacientes grátis". Os números são ilustrativos, como em material de marketing.
  6. Frase de impacto sobreposta, por exemplo "Nutrição de precisão, do consultório ao prato.", com legibilidade garantida.
- **Movimento:**
  - No desktop, as camadas reagem ao **movimento do mouse**. Cada camada se desloca proporcionalmente à profundidade (por exemplo de ±4 px na mais distante a ±28 px na mais próxima), com `useSpring` para suavizar.
  - Cada camada também tem uma flutuação lenta contínua, de baixa amplitude.
  - No celular, a cena reage à **rolagem** (`useScroll` + `useTransform`). Não use giroscópio sem permissão do usuário.
- **Regras técnicas:**
  - Anime só `transform` e `opacity`, com `will-change` apenas nas camadas que se movem.
  - Nenhum layout shift.
  - Com `prefers-reduced-motion`, a cena fica estática.
  - A cena é decorativa: use `aria-hidden` e mantenha o foco só no formulário.
  - A cena é um Client Component isolado (`login-parallax-scene.tsx`), carregado com prioridade de imagem só na primeira camada fotográfica.
- **Imagens:**
  - Use **somente imagens com licença livre para uso comercial** (por exemplo Unsplash ou Pexels) ou geradas por você.
  - Registre fonte, autor e licença de cada uma em `apps/web/public/images/CREDITS.md`.
  - Sem marcas, rótulos ou logos de terceiros visíveis.
  - Otimize para WebP/AVIF, com no máximo cerca de 200 KB por camada.

**Formulário**
- Título "Entrar na Rafanutri" e subtítulo curto.
- Campos:
  - **E-mail**, com `autoComplete="email"`.
  - **Senha**, com botão de mostrar e ocultar acessível e `autoComplete="current-password"`.
- Links "Esqueci minha senha" (página `/recuperar-senha` provisória) e "Criar conta grátis" (página `/cadastro` provisória).
- Botão "Entrar" com estado de carregamento. O botão fica desabilitado durante o envio.
- Validação com Zod no cliente e de novo na Server Action. As mensagens de erro ficam abaixo de cada campo, com `aria-describedby`.
- Erros do servidor em `Alert` do shadcn/ui, com mensagem neutra: "E-mail ou senha incorretos", sem revelar qual dos dois falhou. Mensagem específica quando o Directus responder limite de tentativas (429).
- Componentes shadcn/ui: `Card`, `Form`, `Input`, `Label`, `Button`, `Alert`, `Separator`, mais `Sonner` para avisos.

**Autenticação (Directus)**
- Server Action `signIn` chama `POST /auth/login` do Directus com `mode: 'json'`, usando `@directus/sdk` no servidor.
- Os tokens ficam em **cookies `httpOnly`, `Secure`, `SameSite=Lax`**:
  - access token com a duração devolvida pelo Directus (15 min);
  - refresh token com 7 dias.
- **Nunca** exponha tokens ao JavaScript do navegador.
- No `proxy.ts` (ou `middleware.ts`):
  - renove o access token com o refresh token quando ele expirar;
  - redirecione quem não está logado para `/login?next=...`;
  - redirecione quem já está logado e abre `/login` para a área logada.
- Depois do login, redirecione para `next`, se for um caminho interno válido. Proteja contra open redirect: aceite só caminhos que começam com `/` e não com `//`. Sem `next`, redirecione para `/app`, uma página provisória "Bem-vindo, {nome}" com botão "Sair".
- Server Action `signOut` chama `/auth/logout` e limpa os cookies.
- Variáveis de ambiente, validadas com Zod na inicialização:
  - `DIRECTUS_URL`, a URL da API, usada só no servidor;
  - `NEXT_PUBLIC_SITE_URL`.

### 6. Deploy no Coolify (vpsrafa) com deploy automático

**Dockerfile** em `apps/web/Dockerfile`, multi-stage:
- Estágio de `turbo prune @rafanutri/web --docker`, depois instalação com pnpm (corepack), build e runner mínimo.
- Base `node` LTS em Alpine ou Debian slim, com **suporte a ARM64**, porque a VPS é Oracle Ampere.
- Runner com o `output: 'standalone'` do Next.js, usuário não root, `PORT=3000` e **`HOSTNAME=0.0.0.0`**. Sem isso, o Next.js dentro do Docker escuta no hostname do contêiner e o proxy recebe 502; isso já aconteceu nesta VPS.
- `HEALTHCHECK` chamando `GET /api/health`, uma rota que responde `{ status: "ok" }` sem consultar serviços externos.
- `.dockerignore` excluindo `node_modules`, `.next`, `.git`, `docs`, arquivos `.env*` e testes.

**Configuração no Coolify (versão 4)**
- Criar o projeto **Rafanutri** com o ambiente **production**.
- **Nova aplicação** com origem no repositório GitHub privado `brunokobi/plataforma_rafanutri` via **GitHub App**, branch `main`.
- **Build pack Dockerfile**: base directory `/` e Dockerfile `apps/web/Dockerfile`.
- **Porta 3000**. Domínio sugerido: `https://rafanutri.brunokobi.tech`, que o curinga do Cloudflare já resolve para a VPS.
- **Deploy automático** a cada push na `main`. Configure *watch paths* para `apps/web/**`, `packages/**`, `pnpm-lock.yaml` e `turbo.json`, para não reconstruir quando só a documentação mudar.
- Variáveis de ambiente no Coolify (nunca no repositório):
  - `DIRECTUS_URL=https://rafanutri-api.brunokobi.tech`
  - `NEXT_PUBLIC_SITE_URL=https://rafanutri.brunokobi.tech`
  - Variáveis `NEXT_PUBLIC_*` precisam estar disponíveis também **no build**.
- Health check do Coolify em `/api/health`.
- No `.env` do Directus, incluir o domínio do app em `CORS_ORIGIN`. Com login feito pelo servidor isso não é obrigatório, mas deixa preparado para chamadas do navegador.
- **Recursos:** a VPS tem 2 OCPU e cerca de 6 GB livres. Limite a memória do build, por exemplo com `NODE_OPTIONS=--max-old-space-size=2048`, e documente o tempo médio de build.
- Documente no `README.md` a seção "Deploy" e crie `docs/runbooks/deploy-web-coolify.md` com o passo a passo acima, inclusive como fazer rollback para o deploy anterior no Coolify.

**CI (GitHub Actions)**
- Em todo pull request e push: lint, typecheck, testes unitários e build.
- O deploy fica a cargo do Coolify. O CI só garante que a `main` está sempre verde.

### 7. Testes

- **Unitários (Vitest):** schema Zod do login, função de validação do `next` (open redirect) e helpers de cookie.
- **Componente (Testing Library):** o formulário mostra erros de validação e o estado de carregamento.
- **E2E (Playwright):**
  - login com sucesso;
  - login com senha errada mostra o alerta neutro;
  - rota protegida redireciona para `/login?next=`;
  - logout limpa a sessão;
  - com `prefers-reduced-motion`, a cena não anima.
  - Use um usuário de teste do Directus definido por variável de ambiente.
- **Acessibilidade:** `@axe-core/playwright` sem violações sérias nas duas páginas.

### 8. Critérios de aceite

- [ ] `/` e `/login` funcionam no tema claro e escuro, do celular (360 px) ao desktop (1440 px), sem rolagem horizontal.
- [ ] O parallax do login é fluido (60 fps num notebook comum), reage ao mouse no desktop e à rolagem no celular, e fica estático com `prefers-reduced-motion`.
- [ ] Login real contra o Directus de produção: o administrador entra, cai em `/app` e sai pelo botão "Sair".
- [ ] Nenhum token visível no JavaScript do navegador (`document.cookie` não mostra os cookies de sessão).
- [ ] Lighthouse no celular acima de 90 nas quatro categorias da página inicial e acima de 85 em desempenho no login.
- [ ] Push na `main` dispara o deploy no Coolify, e `https://rafanutri.brunokobi.tech/api/health` responde `ok` depois do deploy.
- [ ] `CREDITS.md` lista todas as imagens com licença comercial.
- [ ] README e runbook de deploy atualizados.

### 9. Fora do escopo desta entrega

- Cadastro funcional, recuperação de senha e onboarding (as páginas existem só como provisórias, com o layout final).
- Área logada real (organizações, pacientes): `/app` é só um placeholder.
- Login social e login do paciente.
