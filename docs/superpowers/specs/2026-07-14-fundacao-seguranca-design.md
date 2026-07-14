# RaidSync — Fundação & Segurança (Design)

- **Data:** 2026-07-14
- **Subsistema:** #1 de 10 — Fundação & Segurança
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

RaidSync é uma plataforma multiplataforma (Flutter para Android/Windows/Web) para
gerenciar Operations de SWTOR, com backend Node.js/Express, MySQL, Socket.IO e
integração ao Discord. O escopo total é grande (~10 subsistemas independentes).

Este documento especifica **apenas o primeiro subsistema: Fundação & Segurança** —
o esqueleto de autenticação, autorização e hardening sobre o qual todos os demais
subsistemas (Personagens, Raids, Tempo real, Discord Bot, Notificações, Dashboard,
Compartilhamento, Admin, Camada visual) serão construídos, herdando a segurança em
vez de remendá-la depois.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Modelo de acesso | **Login aberto** — qualquer conta Discord pode logar. Sem gating por associação a servidor. |
| RBAC | Papéis `user` (padrão) e `admin`. Admin **semeado por env** (`ADMIN_DISCORD_IDS`) e promovível/rebaixável pelo painel (auditável). |
| Estratégia de token | **Híbrida**: access JWT curto (~15min, Bearer) + refresh rotativo revogável. Web: refresh em cookie `httpOnly`. Mobile/desktop: refresh em Flutter Secure Storage. |
| Alcance deste spec | Backend completo (TypeScript) **+ fatia fina de login Flutter** (walking skeleton fim-a-fim). |
| Linguagem backend | **TypeScript**. |
| Arquitetura | **Monólito modular Express + TS**, fatiado por feature, Kysely (queries tipadas e parametrizadas) no MySQL. |

## Objetivos e critérios de sucesso

- Um usuário consegue logar com o Discord em Web, Android e Windows e ver seu perfil
  (`GET /me`) numa tela autenticada Flutter.
- Toda rota protegida nega por padrão sem access token válido (401) e nega ação de
  admin a não-admins (403).
- Refresh rotaciona a cada uso, é revogável, e reuso de token revogado dispara
  revogação da família inteira.
- Segredos (client secret do Discord, JWT secret) nunca chegam ao client.
- Toda entrada é validada (Zod) e toda query é parametrizada (Kysely).
- A suíte de testes cobre os caminhos de segurança (auth ok/falha, rotação, reuso,
  guards, rate-limit).

## Fora de escopo (specs futuros)

Personagens, progressão PvE/Tier, raids, waitlist, Socket.IO, bot do Discord,
notificações push, dashboard, compartilhamento/QR, painel admin completo, e toda a
camada visual do `design_system.md` (motion, shaders, WebGL). A fatia Flutter aqui
é intencionalmente sem tema holográfico.

---

## Seção 1 — Modelo de ameaças & princípios

**Ativos:** identidade/tokens do usuário, o privilégio de admin, PII (discord_id,
email, avatar), o banco, e o **client secret do Discord**.

**Fronteiras de confiança:** Client Flutter (incluindo Web, *não confiável*) ↔ API;
API ↔ Discord; API ↔ MySQL.

**Ameaças → mitigações (STRIDE enxuto):**

| Ameaça | Mitigação |
|--------|-----------|
| Spoofing | OAuth2 Authorization Code **+ PKCE**, parâmetro `state` anti-CSRF, troca do code **no servidor**, JWT assinado |
| Tampering | Assinatura JWT, validação Zod em todo payload, queries parametrizadas (Kysely), headers Helmet |
| Repudiation | Log de auditoria de ações de admin, logs estruturados com `requestId` |
| Information disclosure | HTTPS + HSTS, refresh em cookie `httpOnly` na Web, claims mínimas, erros sem vazar interno, CORS allowlist |
| DoS | `express-rate-limit` global + estrito em `/auth/*`, limite de body, timeouts |
| Elevation of privilege | RBAC **deny-by-default**, admin semeado por env, rotação + revogação de refresh |

**Princípios inegociáveis:** menor privilégio · negar por padrão · defesa em
profundidade · *fail closed* · nenhum segredo no client · validar na fronteira ·
tudo parametrizado.

## Seção 2 — Arquitetura & estrutura de módulos

```
backend/  (Node + TypeScript)
  src/
    config/        # carrega e VALIDA env com Zod no boot (fail-fast)
    db/            # instância Kysely + migrations + tipos do schema
    common/
      middleware/  # helmet, cors(allowlist), rateLimit, requestId, errorHandler, notFound
      security/    # assinar/verificar JWT, guards requireAuth / requireAdmin
      validation/  # middleware validate(schema) baseado em Zod
      errors/      # AppError tipadas (401/403/404/409/422…)
      logger/      # pino estruturado
    modules/
      auth/        # OAuth Discord, emitir/rotacionar/revogar token, /me
        auth.router.ts | auth.controller.ts | auth.service.ts
        auth.repository.ts | auth.schemas.ts
      users/       # perfil, promover/rebaixar admin, listar (admin)
    app.ts         # montagem do Express (ordem dos middlewares importa)
    server.ts      # bootstrap HTTP
  tests/           # integração (supertest) + unidade

app/  (Flutter — fatia fina de login)
  lib/core/auth/     # serviço de auth, storage de token, launcher OAuth (Riverpod)
  lib/core/network/  # Dio com interceptors (Bearer + refresh em 401)
  lib/core/router/   # GoRouter com guarda mínima (login ↔ home)
  lib/features/login/ + lib/features/home/
```

Cada módulo é fatia vertical isolada (router → controller → service → repository),
testável sozinho. A camada `common/security` é reusada por todos os subsistemas
futuros — é onde "segurança desde a base" vira código concreto.

## Seção 3 — Fluxo de autenticação (OAuth2 Discord + tokens)

**Login (Authorization Code + PKCE), troca do code no servidor:**

```
1. Client gera code_verifier + code_challenge (PKCE) e um state aleatório
2. Client abre o consentimento do Discord (scopes: identify, email)
3. Discord redireciona com ?code&state → client entrega code ao backend
4. Backend valida state, troca code+code_verifier por token do Discord
   (usando CLIENT_SECRET, que nunca sai do servidor)
5. Backend consulta a API do Discord: id, username, avatar, email
6. Backend faz UPSERT em `usuarios`; decide papel (semente env → admin, senão user)
7. Backend emite access token (JWT ~15min) + refresh token (rotativo)
8. Entrega ao client conforme a plataforma
```

**Callback multiplataforma:**

| Plataforma | Redirect (recebe o `code`) | Refresh token |
|-----------|----------------------------|---------------|
| Web | rota do SPA `https://.../auth/callback` → SPA faz `POST /auth/callback` | Cookie `httpOnly` + `Secure` + `SameSite=Lax` |
| Android | deep link `raidsync://auth` (`flutter_web_auth_2`) → app faz `POST /auth/callback` | Flutter Secure Storage |
| Windows | loopback `http://127.0.0.1:<porta>` → app faz `POST /auth/callback` | Flutter Secure Storage |

Em todas as plataformas o Discord redireciona para um destino que **recebe o `code`**;
o client então o envia ao endpoint de API `POST /auth/callback`. O **access token**
vai sempre no corpo da resposta (Bearer). Na Web fica só em memória; o refresh via
cookie reergue a sessão.

**Refresh & rotação:**

```
POST /auth/refresh → valida refresh (hash conferido no DB) →
  se válido e não revogado: emite novo par, REVOGA o antigo (rotação) →
  se refresh já revogado reaparecer: reuso detectado → revoga a família inteira
```

**Endpoints da fundação:**

- `GET  /auth/discord/url` — URL de consentimento + state
- `POST /auth/callback` — troca code, emite tokens
- `POST /auth/refresh` — rotaciona
- `POST /auth/logout` — revoga refresh atual (e limpa cookie na Web)
- `GET  /me` — perfil autenticado (prova o walking skeleton)

## Seção 4 — Modelo de dados (fundação)

```sql
usuarios
  id            BIGINT PK AUTO
  discord_id    VARCHAR UNIQUE NOT NULL
  username      VARCHAR NOT NULL
  nickname      VARCHAR NULL
  avatar        VARCHAR NULL
  email         VARCHAR NULL
  role          ENUM('user','admin') NOT NULL DEFAULT 'user'
  created_at    DATETIME NOT NULL
  updated_at    DATETIME NOT NULL

refresh_tokens
  id            BIGINT PK AUTO
  usuario_id    BIGINT FK → usuarios(id) ON DELETE CASCADE
  token_hash    CHAR(64) NOT NULL        -- SHA-256; nunca guardamos o token cru
  family_id     CHAR(36) NOT NULL        -- cadeia de rotação (detecta reuso)
  device        VARCHAR NULL             -- rótulo/plataforma p/ "sessões ativas"
  expires_at    DATETIME NOT NULL
  revoked_at    DATETIME NULL
  created_at    DATETIME NOT NULL
  INDEX (usuario_id), INDEX (token_hash), INDEX (family_id)

admin_audit_log
  id            BIGINT PK AUTO
  actor_id      BIGINT FK → usuarios(id)
  action        VARCHAR NOT NULL         -- 'promote','demote','revoke_sessions'…
  target_id     BIGINT NULL
  metadata      JSON NULL
  created_at    DATETIME NOT NULL
```

`usuarios` amplia a tabela do `context..md` com `role` e `updated_at`.
`refresh_tokens` e `admin_audit_log` são novas — dão revogação real e não-repúdio.
Tabelas de personagens/raids/bosses ficam para specs seguintes.

## Seção 5 — Controles de hardening (ordem dos middlewares)

```
app.ts (ordem de aplicação):
  1. requestId            → correlação em logs
  2. helmet()             → HSTS, noSniff, frameguard, CSP básica p/ API
  3. cors(allowlist)      → só origens conhecidas; credentials:true p/ cookie
  4. express.json({limit:'100kb'})  → limite de body (anti-DoS)
  5. cookieParser()       → ler refresh cookie na Web
  6. rateLimit global     → ex.: 100 req/min por IP
  7. rotas
       /auth/*  → rateLimit ESTRITO (ex.: 10/min)
  8. notFound handler
  9. errorHandler central → mapeia AppError → status; nunca vaza stack/SQL
```

- **CSRF**: double-submit token nas rotas que usam o cookie na Web (`/auth/refresh`,
  `/auth/logout`).
- **Sem `bcrypt`**: não há senha — auth é 100% Discord.
- Todo segredo/URL sensível fica fora do client.

## Seção 6 — Configuração & segredos

- `config/` valida o `.env` com Zod no boot; falta de `DISCORD_CLIENT_SECRET`,
  `JWT_SECRET`, `DATABASE_URL` etc. **derruba o processo na largada** (fail-fast).
- Variáveis: `JWT_SECRET` (ou par RS256), `ADMIN_DISCORD_IDS`, `CORS_ORIGINS`,
  credenciais MySQL, `DISCORD_CLIENT_ID/SECRET`, `DISCORD_REDIRECT_URI`.
- `.env.example` versionado (sem valores reais); `.env` no `.gitignore`.
- O client Flutter só conhece `API_BASE_URL` e `DISCORD_CLIENT_ID` (público).

## Seção 7 — Fatia Flutter (walking skeleton)

- `core/auth/`: dispara OAuth (`flutter_web_auth_2`), guarda tokens (Secure Storage
  no mobile/desktop; memória + cookie na Web), estado via Riverpod.
- `core/network/`: cliente Dio com interceptors — anexa `Authorization: Bearer`, e
  em `401` tenta `/auth/refresh` uma vez antes de deslogar.
- `core/router/`: GoRouter com guarda mínima (`/login` ↔ `/home`).
- `features/login/`: botão "Entrar com Discord" (feedback `Scale 0.97` ao pressionar,
  estado de loading, conforme `design_system.md`).
- `features/home/`: tela autenticada que chama `GET /me` e mostra avatar + nick.

Sem tema holográfico/shaders ainda (isso é o subsistema visual).

## Seção 8 — Erros, logs e testes

- **Erros:** hierarquia `AppError` (`UnauthorizedError`, `ForbiddenError`,
  `ValidationError`…). Handler central devolve `{ error: { code, message } }`
  uniforme, sem stack/SQL.
- **Logs:** `pino` com `requestId`; loga tentativas de auth falhas e ações de admin;
  nunca loga tokens nem email cru.
- **Testes:**
  - Integração (supertest): `/auth/callback` com Discord mockado; rotação de refresh;
    **detecção de reuso**; guards `requireAuth`/`requireAdmin` negando; rate-limit.
  - Unidade: serviços de token (assinar/verificar/rotacionar), config fail-fast.
  - Casos de segurança explícitos: token expirado, assinatura inválida, `state`
    inválido no OAuth, promoção por não-admin (403).

---

## Dependências (backend)

`express`, `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `jsonwebtoken`,
`zod`, `kysely` + driver `mysql2`, `pino`, `dotenv`, `undici`/`node:fetch` (chamadas
ao Discord). Dev: `typescript`, `tsx`/`ts-node`, `vitest`/`jest`, `supertest`,
ferramenta de migration (Kysely migrator).

## Riscos e questões em aberto

- **Callback desktop (loopback)**: exige registrar o redirect de loopback no app do
  Discord; validar porta dinâmica vs fixa na implementação.
- **Deep link Android**: registrar o scheme `raidsync://` no manifest.
- **CSRF + CORS com credentials**: a allowlist precisa ser exata (sem `*`) porque
  usamos cookies com `credentials:true`.
- **`ADMIN_DISCORD_IDS`**: bootstrap do primeiro admin depende dessa lista estar
  correta no deploy.

## Próximo passo

Transicionar para a skill `writing-plans` e produzir o plano de implementação
faseado desta fundação.
