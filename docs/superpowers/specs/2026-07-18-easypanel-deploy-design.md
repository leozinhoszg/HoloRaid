# Deploy do HoloRaid na VPS com EasyPanel — Design

**Data:** 2026-07-18
**Domínio:** https://holoraid.fun
**Objetivo:** colocar backend + web + banco em produção numa VPS gerida pelo EasyPanel, sob um único domínio, de forma reproduzível (Dockerfiles versionados) e com o bot do Discord e as notificações por DM ativos.

---

## 1. Decisões (fechadas no brainstorming)

| Tema | Decisão |
|------|---------|
| **Topologia** | Domínio único `holoraid.fun`; API sob `/api`; SPA na raiz. |
| **Proxy** | Serviço **Nginx** ("web") é o único com domínio público; faz proxy interno de `/api` e `/socket.io` para o backend. Backend **não** exposto publicamente. |
| **Banco** | Serviço **MySQL** dentro do EasyPanel (rede interna). |
| **Build** | **Dockerfiles no repo**. Flutter Web buildado **no Docker, no próprio EasyPanel** (Opção A) — VPS ≥ 4 vCPU / 8 GB aguenta. |
| **Bot & Push** | **Bot Discord + DM ativos** (via `DISCORD_BOT_TOKEN`). FCM/Firebase fica inerte (sem credencial) até configurar depois. |
| **CORS** | Some — mesma origem. `CORS_ORIGINS` fica só para o Socket.IO handshake. |

---

## 2. Arquitetura

```
                 Internet ──▶ holoraid.fun  (Traefik do EasyPanel, SSL/Let's Encrypt)
                                   │
                          ┌────────▼─────────┐
                          │  web  (Nginx)    │   único serviço com domínio
                          │  · Flutter Web   │
                          │  · SPA fallback  │   try_files → /index.html
                          │  · /api/  ───────┼── proxy_pass (strip /api) ─┐
                          │  · /socket.io/ ──┼── proxy_pass (WebSocket) ──┤
                          └──────────────────┘                            │
                                                              ┌───────────▼────────────┐
                                                              │ backend (Node)          │
                                                              │ REST + Socket.IO        │
                                                              │ + bot Discord (mesmo    │
                                                              │   processo)             │
                                                              └───────────┬─────────────┘
                                                                          │ rede interna
                                                              ┌───────────▼─────────────┐
                                                              │ mysql (serviço EasyPanel)│
                                                              └──────────────────────────┘
```

### Roteamento (Nginx)

- `location /api/ { proxy_pass http://backend:3000/; }` — a **barra final** faz o Nginx remover o prefixo `/api`; o backend recebe `/auth/...`, `/raids`, `/health` na raiz (sem mudança de código no backend).
- `location /socket.io/ { proxy_pass http://backend:3000; + headers Upgrade/Connection }` — **sem** strip (o Socket.IO server usa o path default `/socket.io`), com upgrade para WebSocket.
- `location / { try_files $uri $uri/ /index.html; }` — SPA fallback: rotas client-side do Flutter (`/raids`, `/profile`, `/r/{codigo}`, `/terms`, `/privacy`) caem no `index.html`.

> **Por que a colisão de rotas exige o `/api`:** o backend serve `/raids`, `/auth` na raiz e o Flutter Web também usa `/raids`, `/profile` como rotas de tela. Sem o prefixo `/api` as duas brigam pela mesma URL. O prefixo separa as duas superfícies limpo.

### Resolução de nomes entre serviços

Serviços do mesmo projeto EasyPanel se resolvem pelo nome na rede Docker interna. O `proxy_pass` usa `http://backend:3000` (ajustar o hostname ao nome real do serviço no EasyPanel, que pode ser prefixado por `<projeto>_`). O backend conecta no MySQL via `DB_HOST=mysql` (idem).

---

## 3. Artefatos a criar

### 3.1 `backend/Dockerfile` (multi-stage Node)

- **Stage build:** `node:22-alpine` → `npm ci` (com devDeps) → `npm run build` (gera `dist/`, incluindo `dist/db/migrations/*.js`).
- **Stage runtime:** `node:22-alpine` → `npm ci --omit=dev` → copia `dist/` → usuário não-root → `CMD`.
- **Migrations no start:** entrypoint roda `node dist/db/migrate.js` (aplica schema + seed dos bosses da migration 002) e depois `node dist/server.js`. Idempotente — o Kysely registra migrations aplicadas.
- **Porta:** expõe 3000 (interna; sem domínio público).
- **Healthcheck:** `GET /health` (na porta interna).

### 3.2 `backend/.dockerignore`

Ignora `node_modules`, `dist`, `tests`, `.env`, `*.log`.

### 3.3 `web/Dockerfile` (multi-stage Flutter → Nginx)

- **Stage build:** imagem com Flutter SDK (ex.: `ghcr.io/cirruslabs/flutter:stable`) → `flutter pub get` → `flutter build web --release` com os `--dart-define` de produção (ver §5.3) e `--base-href /`.
- **Stage runtime:** `nginx:alpine` → copia `build/web` para `/usr/share/nginx/html` → copia `web/nginx.conf`.

> O `web/` (Dockerfile + nginx.conf) fica na **raiz do repo**, com o build-context apontando para `app/` (onde vive o projeto Flutter). Ajuste do contexto no EasyPanel.

### 3.4 `web/nginx.conf`

Server único na porta 80 com os três `location` da §2. Inclui:
- headers de WebSocket (`Upgrade`, `Connection`) no `/socket.io/`;
- `gzip` para assets;
- cache longo para `assets/`, `canvaskit/` (hash no nome), `no-cache` para `index.html`;
- `client_max_body_size` compatível com o backend (o backend limita JSON a 100 kB).

### 3.5 `.env` de produção

**Não** vai no git (já gitignored). Preenchido nas **Environment Variables** do serviço backend no EasyPanel. Ver §5.1.

---

## 4. Mudanças de código

Mínimas e compatíveis com o dev local.

| # | Arquivo | Mudança | Por quê |
|---|---------|---------|---------|
| 1 | `app/lib/core/realtime/socket_service.dart` | Conectar o socket na **origem** em vez de `apiBaseUrl`: derivar removendo o sufixo `/api` (`apiBaseUrl.endsWith('/api') ? apiBaseUrl sem '/api' : apiBaseUrl`). | Em prod, `apiBaseUrl` = `https://holoraid.fun/api`; o Socket.IO precisa do host `https://holoraid.fun` com path default `/socket.io` (senão o `/api` vira namespace e o handshake quebra). Dev local (`localhost:3000`) não termina com `/api` → intacto. |
| 2 | `backend/src/db/migrate.ts` | Verificar/garantir que `node dist/db/migrate.js` roda standalone (o guard `require.main === module` já existe). Nenhuma mudança se o build já emite as migrations. | Produção não tem `tsx` (devDependency). |
| 3 | *(condicional)* OAuth redirect por plataforma | Ver §6 — só se a validação web falhar. | `DISCORD_REDIRECT_URI` é único hoje; web e mobile querem valores diferentes. |

Nenhuma mudança no roteamento do backend (o strip do `/api` é do Nginx).

---

## 5. Configuração de produção

### 5.1 Variáveis de ambiente — serviço **backend**

| Var | Valor de produção | Notas |
|-----|-------------------|-------|
| `NODE_ENV` | `production` | ativa cookie `secure` no refresh. |
| `PORT` | `3000` | interna. |
| `DB_HOST` | `mysql` (nome do serviço) | rede interna. |
| `DB_PORT` | `3306` | |
| `DB_USER` | `holoraid` | usuário dedicado, menor privilégio. |
| `DB_PASSWORD` | *(segredo forte)* | |
| `DB_NAME` | `holoraid` | |
| `JWT_SECRET` | *(≥ 32 chars aleatórios)* | **novo**, não reusar o de dev. |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | |
| `DISCORD_CLIENT_ID` | `1527984655951986750` | app "HoloRaid". |
| `DISCORD_CLIENT_SECRET` | *(segredo)* | |
| `DISCORD_REDIRECT_URI` | *(ver §6)* | valor web de produção. |
| `ADMIN_DISCORD_IDS` | *(discord id do dono)* | vira admin no 1º login. |
| `CORS_ORIGINS` | `https://holoraid.fun` | usado pelo Socket.IO handshake. |
| `DISCORD_BOT_TOKEN` | *(segredo)* | ativa bot + DM + agendador de lembretes. |
| `APP_PUBLIC_URL` | `https://holoraid.fun` | usado em embeds/links do Discord. |
| `FIREBASE_SERVICE_ACCOUNT` | *(vazio)* | FCM inerte; DM cobre as notificações. |

### 5.2 Variáveis — serviço **mysql**

`MYSQL_DATABASE=holoraid`, `MYSQL_USER=holoraid`, `MYSQL_PASSWORD=<segredo>`, `MYSQL_ROOT_PASSWORD=<segredo>`. Volume persistente para `/var/lib/mysql`.

> **Grant:** o app conecta como `holoraid`@`%`. O template MySQL do EasyPanel já cria o usuário com acesso ao database — validar que o grant cobre `holoraid.*` (lição do rebrand: grant em `localhost` ≠ `%`).

### 5.3 `--dart-define` do build web (no `web/Dockerfile`)

- `API_BASE_URL=https://holoraid.fun/api`
- `DISCORD_CLIENT_ID=1527984655951986750`
- `APP_PUBLIC_URL=https://holoraid.fun`

### 5.4 Discord Developer Portal (app `1527984655951986750`)

- **Redirect (OAuth2):** adicionar a URL web de produção (§6). Manter o scheme mobile `holoraid://auth` se o app mobile também for usado.
- **"URL de endpoint de interações":** deve ficar **VAZIA** (o bot usa gateway; preencher quebra os handlers — lição registrada).
- **ToS/Privacy:** `https://holoraid.fun/terms` e `https://holoraid.fun/privacy`.

---

## 6. Risco central: OAuth no Flutter Web

**Problema:** o backend usa **um único** `DISCORD_REDIRECT_URI` no authorize **e** na troca do code (o Discord exige que batam). No mobile/desktop o `flutter_web_auth_2` usa `callbackUrlScheme: 'holoraid'` → redirect `holoraid://auth`. No **web** o plugin não usa scheme custom: o Discord redireciona o browser para uma **URL HTTP** da própria origem, e o plugin captura o `?code=`. Os dois valores são incompatíveis num único env.

**Para este deploy (alvo = web):** definir `DISCORD_REDIRECT_URI` com a URL web de produção e validar o primeiro login em `holoraid.fun`. Confirmar durante a implementação **qual URL exata** o `flutter_web_auth_2` espera no web (a origem `https://holoraid.fun` ou uma rota de callback dedicada) e registrar essa mesma URL no Discord.

**Se web e mobile precisarem coexistir:** promover `/auth/discord/url` a escolher o redirect por plataforma — aceitar `?platform=web|mobile` e ter dois envs (`DISCORD_REDIRECT_URI_WEB` / `_MOBILE`), usando o mesmo valor na troca do code. **Fora do escopo do deploy inicial**; entra só se a validação exigir. Fica registrado como fast-follow.

---

## 7. Sequência de deploy (EasyPanel)

1. **Projeto** novo no EasyPanel (ex.: `holoraid`).
2. **Serviço mysql** (template MySQL) com as envs da §5.2 + volume. Subir e confirmar saudável.
3. **Serviço backend** (App, source = repo Git, build = `backend/Dockerfile`, context `backend/`) com as envs da §5.1. **Sem** domínio público. Deploy → o entrypoint roda migrations (cria schema + seed) e sobe.
4. **Serviço web** (App, source = repo Git, build = `web/Dockerfile`, context ajustado p/ enxergar `app/`). Domínio `holoraid.fun` → porta 80. SSL automático (Let's Encrypt via Traefik).
5. **DNS:** apontar `holoraid.fun` (A/AAAA) para o IP da VPS. Aguardar propagação + emissão do certificado.
6. **Discord Portal:** registrar o redirect web e confirmar interactions endpoint vazio (§5.4).
7. **Validação** (§8).

> **Ordem de dependência:** mysql → backend → web. O `proxy_pass` do Nginx resolve o backend por nome; se o web subir antes do backend, o `/api` dá 502 até o backend responder (aceitável no primeiro boot).

---

## 8. Validação pós-deploy (smokes reais)

- [ ] `https://holoraid.fun/` carrega o app Flutter; SSL válido.
- [ ] `https://holoraid.fun/api/health` → `{ok:true}` (prova o proxy + strip).
- [ ] `https://holoraid.fun/terms` e `/privacy` renderizam.
- [ ] **Login OAuth web** completo (o teste do risco §6): botão → Discord → volta logado. Admin (`ADMIN_DISCORD_IDS`) vê o botão Admin.
- [ ] **Socket ao vivo:** duas abas; criar/join numa raid reflete na outra (prova `/socket.io` + WebSocket pelo Nginx).
- [ ] **Bot Discord:** `/set_raid_channel` + `/create_raid` no servidor de teste; embed com `@here` posta (smoke visual que faltava). Botões Join/Leave funcionam.
- [ ] **DM:** um leave que promove alguém da waitlist gera DM (com `DISCORD_BOT_TOKEN`).
- [ ] Banco: as 7 migrations aplicadas + 105 bosses seedados (`SELECT COUNT(*) FROM bosses`).

---

## 9. Preparação do git ("está pronta")

Estado atual: branch `fix/oauth-login` com **1 commit** não mergeado (`3e9f0a6`), não pushada. `master` = `origin/master`.

- [ ] Decidir o destino de `backend/src/assets/` (20 SVG/PNG de classes/facções, **untracked, sem referência no código**): comitar (se forem para uso futuro do web/app) ou remover/ignorar. Não bloqueia o deploy.
- [ ] Implementar as mudanças de código (§4) + criar os artefatos (§3) numa branch de deploy (ex.: `feat/deploy-easypanel`).
- [ ] Verificar build local: `cd backend && npm run build` limpo, `node dist/db/migrate.js` roda, `npm test` verde (211 testes). `cd app && flutter analyze` limpo + `flutter build web` passa.
- [ ] Mergear `fix/oauth-login` na `master` (`--no-ff`) — o fix de OAuth é pré-requisito do login em prod.
- [ ] Merge da branch de deploy → `master`, push para `origin`.
- [ ] Commits só sob `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>` (sem Co-Authored-By).

**"Está pronta?"** — sim para deploy, com **uma ressalva**: o **OAuth web (§6) é o único ponto não exercitado** e pode exigir o ajuste de redirect por plataforma. Todo o resto (backend, socket, bot, DM, migrations, páginas legais) está implementado e testado.

---

## 10. Pendências não-bloqueantes (registradas)

- **`contato@holoraid.fun`** citado nas páginas legais — criar a caixa ou trocar o contato.
- **Firebase/FCM** inerte por escolha; DM cobre. Ativar depois é só popular `FIREBASE_SERVICE_ACCOUNT`.
- **Task 8 do #6 (Flutter push)** segue pendente (exige `flutterfire configure`) — não afeta este deploy.
- **Android** (APK) é distribuição, não entra na VPS.
- **Backups do MySQL** — configurar no EasyPanel após o primeiro deploy.
