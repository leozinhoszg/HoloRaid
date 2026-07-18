# Deploy EasyPanel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empacotar o HoloRaid (backend Node + Flutter Web) em imagens Docker versionadas e servi-lo sob `https://holoraid.fun` no EasyPanel, com MySQL interno e bot Discord ativo.

**Architecture:** Um serviço **Nginx** ("web") é o único com domínio público: serve o Flutter Web estático (com SPA fallback) e faz reverse-proxy de `/api/` (com strip do prefixo) e `/socket.io/` (WebSocket) para o serviço **backend** Node, que fica só na rede interna junto do serviço **mysql**. O backend não muda de roteamento — o strip do `/api` acontece no Nginx via `proxy_pass` com barra final.

**Tech Stack:** Docker multi-stage (Node 22 Alpine; Flutter stable; Nginx Alpine), EasyPanel (Traefik + Let's Encrypt), MySQL 8, Socket.IO (WebSocket), discord.js.

## Global Constraints

- **Domínio único:** `https://holoraid.fun`. API sob `/api`; Socket.IO em `/socket.io`; SPA na raiz.
- **Commits:** autor sempre `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** adicionar `Co-Authored-By` nem autorar como Claude.
- **Branch de trabalho:** `feat/deploy-easypanel` (já criada, com o design doc + assets).
- **Sem regressão no dev local:** as mudanças de código devem manter `API_BASE_URL` default `http://localhost:3000` funcionando.
- **Migrations em produção rodam compiladas:** `node dist/db/migrate.js` (o `tsx` é devDependency e não existe no runtime).
- **Discord `client_id`:** `1527984655951986750` (app "HoloRaid").
- **Bot usa GATEWAY**, não webhook: a "URL de endpoint de interações" no Discord Portal deve ficar VAZIA.
- **Docker daemon está desligado nesta máquina:** passos de `docker build` são marcados como *(requer Docker ligado)* — se indisponível, a verificação real acontece no primeiro deploy do EasyPanel.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/lib/core/config/socket_origin.dart` (novo) | Função pura `deriveSocketOrigin(String apiBaseUrl)` que remove o sufixo `/api` para o Socket.IO conectar na origem. |
| `app/test/socket_origin_test.dart` (novo) | Testes da função pura. |
| `app/lib/core/realtime/socket_service.dart` (modificar) | Usar `deriveSocketOrigin(AppConfig.apiBaseUrl)` no `io.io(...)`. |
| `backend/Dockerfile` (novo) | Build multi-stage do backend Node. |
| `backend/.dockerignore` (novo) | Excluir `node_modules`, `dist`, `tests`, `.env` do contexto. |
| `backend/docker-entrypoint.sh` (novo) | Roda migrations e sobe o server. |
| `web/nginx.conf` (novo) | Config do Nginx: estático + SPA fallback + proxy `/api` e `/socket.io`. |
| `web/Dockerfile` (novo) | Build multi-stage: Flutter Web → Nginx. |
| `backend/.env.production.example` (novo) | Documenta as variáveis de ambiente de produção. |
| `docs/superpowers/plans/2026-07-18-easypanel-deploy.md` (este) | O plano. |

---

## Task 1: Socket.IO conecta na origem (não em `/api`)

**Files:**
- Create: `app/lib/core/config/socket_origin.dart`
- Test: `app/test/socket_origin_test.dart`
- Modify: `app/lib/core/realtime/socket_service.dart:31-34`

**Interfaces:**
- Produces: `String deriveSocketOrigin(String apiBaseUrl)` — devolve `apiBaseUrl` sem o sufixo `/api` (se houver), senão `apiBaseUrl` inalterado. Sem barra final.

**Por quê:** em produção `AppConfig.apiBaseUrl = https://holoraid.fun/api`. O `socket_io_client`, se receber uma URL com path, trata `/api` como *namespace* e o handshake do engine.io (path default `/socket.io`) quebra. O socket precisa do host puro (`https://holoraid.fun`) com o path default. Em dev, `http://localhost:3000` não termina com `/api` → intacto.

- [ ] **Step 1: Escrever o teste que falha**

`app/test/socket_origin_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/config/socket_origin.dart';

void main() {
  group('deriveSocketOrigin', () {
    test('remove o sufixo /api', () {
      expect(deriveSocketOrigin('https://holoraid.fun/api'), 'https://holoraid.fun');
    });

    test('mantem a URL de dev local intacta', () {
      expect(deriveSocketOrigin('http://localhost:3000'), 'http://localhost:3000');
    });

    test('remove barra final antes de avaliar o sufixo', () {
      expect(deriveSocketOrigin('https://holoraid.fun/api/'), 'https://holoraid.fun');
    });

    test('nao mexe quando /api aparece no meio', () {
      expect(deriveSocketOrigin('https://api.example.com'), 'https://api.example.com');
    });
  });
}
```

- [ ] **Step 2: Rodar o teste para vê-lo falhar**

Run: `cd app && flutter test test/socket_origin_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:holoraid/core/config/socket_origin.dart'`.

- [ ] **Step 3: Implementar a função pura**

`app/lib/core/config/socket_origin.dart`:

```dart
/// Deriva a origem para o Socket.IO conectar.
///
/// O Socket.IO usa o path default `/socket.io`; passar uma URL com path
/// (`.../api`) faz o cliente interpretar o path como namespace e quebra o
/// handshake. Em produção `apiBaseUrl` é `https://holoraid.fun/api` e o
/// socket precisa de `https://holoraid.fun`. Em dev (`http://localhost:3000`)
/// nada muda.
String deriveSocketOrigin(String apiBaseUrl) {
  var base = apiBaseUrl;
  if (base.endsWith('/')) base = base.substring(0, base.length - 1);
  if (base.endsWith('/api')) base = base.substring(0, base.length - 4);
  return base;
}
```

- [ ] **Step 4: Rodar o teste para vê-lo passar**

Run: `cd app && flutter test test/socket_origin_test.dart`
Expected: PASS (4 testes).

- [ ] **Step 5: Usar a função no socket_service**

Em `app/lib/core/realtime/socket_service.dart`, adicionar o import no topo:

```dart
import '../config/socket_origin.dart';
```

E trocar a chamada `io.io` (linhas ~31-34) de:

```dart
    final s = io.io(
      AppConfig.apiBaseUrl,
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().setAuth({'token': storage.accessToken}).build(),
    );
```

para:

```dart
    final s = io.io(
      deriveSocketOrigin(AppConfig.apiBaseUrl),
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().setAuth({'token': storage.accessToken}).build(),
    );
```

- [ ] **Step 6: Verificar analyze + toda a suíte de testes do app**

Run: `cd app && flutter analyze && flutter test`
Expected: `No issues found!` e todos os testes passam (10 widget tests anteriores + 4 novos).

- [ ] **Step 7: Commit**

```bash
git add app/lib/core/config/socket_origin.dart app/test/socket_origin_test.dart app/lib/core/realtime/socket_service.dart
git commit -m "feat(web): socket conecta na origem (suporte a API sob /api)"
```

---

## Task 2: Dockerfile do backend + entrypoint com migrations

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `backend/docker-entrypoint.sh`

**Interfaces:**
- Consumes: `npm run build` → `dist/` (inclui `dist/server.js`, `dist/db/migrate.js`, `dist/db/migrations/*.js`) — já verificado.
- Produces: imagem que, ao subir, roda `node dist/db/migrate.js` e depois `node dist/server.js`. Escuta na porta 3000 (interna). Healthcheck em `/health`.

- [ ] **Step 1: Confirmar que o build emite o migrate compilado**

Run: `cd backend && npm run build && ls dist/db/migrate.js dist/db/migrations/`
Expected: lista `migrate.js` + `001_init.js` … `007_foreign_keys.js`.

- [ ] **Step 2: Criar o `.dockerignore`**

`backend/.dockerignore`:

```
node_modules
dist
tests
.env
.env.*
*.log
npm-debug.log*
```

- [ ] **Step 3: Criar o entrypoint**

`backend/docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e
echo "[entrypoint] aplicando migrations..."
node dist/db/migrate.js
echo "[entrypoint] subindo o servidor..."
exec node dist/server.js
```

- [ ] **Step 4: Criar o `Dockerfile`**

`backend/Dockerfile`:

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
 && addgroup -S app && adduser -S app -G app \
 && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
```

- [ ] **Step 5: Build local da imagem** *(requer Docker ligado)*

Run: `cd backend && docker build -t holoraid-backend:test .`
Expected: build conclui sem erro; a imagem final é pequena (sem devDeps, sem `src`).
Se o Docker estiver desligado: pular — a verificação real ocorre no deploy do EasyPanel (Task 7).

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore backend/docker-entrypoint.sh
git commit -m "build(backend): Dockerfile multi-stage + entrypoint com migrations"
```

---

## Task 3: Config do Nginx (estático + SPA + proxy)

**Files:**
- Create: `web/nginx.conf`

**Interfaces:**
- Produces: server Nginx na porta 80 que serve `/usr/share/nginx/html` (Flutter Web) com SPA fallback e faz proxy de `/api/` (strip) e `/socket.io/` (WebSocket) para `http://backend:3000`.

**Nota sobre o hostname `backend`:** serviços do mesmo projeto EasyPanel se resolvem pelo nome do serviço na rede interna. Confirmar no painel o nome exato do serviço backend (pode ser prefixado por `<projeto>_`) e ajustar o `proxy_pass` se necessário (Task 7).

- [ ] **Step 1: Criar `web/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml application/wasm;

    # API -> backend. A barra final no proxy_pass remove o prefixo /api:
    #   /api/auth/callback  ->  backend recebe  /auth/callback
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO: sem strip (o server usa o path default /socket.io), com upgrade WebSocket.
    location /socket.io/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    # Assets com hash no nome -> cache longo e imutável.
    location ~* \.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff2?|wasm|json)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    # SPA fallback: rotas client-side do Flutter (/raids, /profile, /r/{codigo}, /terms, /privacy).
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

- [ ] **Step 2: Validar a sintaxe** *(requer Docker ligado)*

Run: `docker run --rm -v "$(pwd)/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`
Expected: `syntax is ok` / `test is successful`.
Se o Docker estiver desligado: revisar o arquivo manualmente; a validação real ocorre no build da Task 4.

- [ ] **Step 3: Commit**

```bash
git add web/nginx.conf
git commit -m "build(web): nginx.conf (SPA fallback + proxy /api e /socket.io)"
```

---

## Task 4: Dockerfile do web (Flutter → Nginx)

**Files:**
- Create: `web/Dockerfile`

**Interfaces:**
- Consumes: `app/` (projeto Flutter) e `web/nginx.conf` (Task 3). **Build context = raiz do repo.**
- Produces: imagem Nginx servindo o Flutter Web buildado com os `--dart-define` de produção.

- [ ] **Step 1: Criar `web/Dockerfile`**

```dockerfile
# ---- build (Flutter Web) ----
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app
# Cache das dependências primeiro
COPY app/pubspec.yaml app/pubspec.lock ./
RUN flutter pub get
# Código
COPY app/ ./
RUN flutter build web --release \
    --dart-define=API_BASE_URL=https://holoraid.fun/api \
    --dart-define=DISCORD_CLIENT_ID=1527984655951986750 \
    --dart-define=APP_PUBLIC_URL=https://holoraid.fun \
    --base-href=/

# ---- runtime (Nginx) ----
FROM nginx:alpine AS runtime
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 2: Build local da imagem (contexto = raiz)** *(requer Docker ligado)*

Run (a partir da raiz do repo): `docker build -f web/Dockerfile -t holoraid-web:test .`
Expected: `flutter pub get` + `flutter build web` concluem; imagem final Nginx com o estático. O build do Flutter pode levar alguns minutos.
Se o Docker estiver desligado: pular — a verificação real ocorre no deploy do EasyPanel (Task 7).

- [ ] **Step 3: (se buildou) Smoke local do container** *(requer Docker ligado)*

Run: `docker run --rm -p 8088:80 holoraid-web:test` e num outro terminal `curl -I http://localhost:8088/`
Expected: `200 OK` servindo `index.html`. (O `/api` dará 502 local sem backend — esperado.)

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile
git commit -m "build(web): Dockerfile Flutter Web -> Nginx com dart-defines de producao"
```

---

## Task 5: Documentar as variáveis de ambiente de produção

**Files:**
- Create: `backend/.env.production.example`

**Interfaces:**
- Produces: um arquivo de referência (não lido pelo app; **não** contém segredos reais) com todas as envs que o serviço backend precisa no EasyPanel.

- [ ] **Step 1: Criar `backend/.env.production.example`**

```dotenv
# ==== Backend HoloRaid — variáveis de PRODUÇÃO (preencher no EasyPanel) ====
# Este arquivo é só referência; NÃO coloque segredos reais aqui nem no git.

NODE_ENV=production
PORT=3000

# Banco — serviço MySQL interno do EasyPanel (DB_HOST = nome do serviço)
DB_HOST=mysql
DB_PORT=3306
DB_USER=holoraid
DB_PASSWORD=__troque_por_um_segredo_forte__
DB_NAME=holoraid

# Auth
JWT_SECRET=__string_aleatoria_com_32+_caracteres__
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

# Discord OAuth (app "HoloRaid")
DISCORD_CLIENT_ID=1527984655951986750
DISCORD_CLIENT_SECRET=__segredo_do_portal__
# Valor WEB de produção — ver §6 do design (validar no 1º login)
DISCORD_REDIRECT_URI=https://holoraid.fun/auth/callback
ADMIN_DISCORD_IDS=__seu_discord_id__

# Front-end / CORS (usado pelo handshake do Socket.IO)
CORS_ORIGINS=https://holoraid.fun
APP_PUBLIC_URL=https://holoraid.fun

# Bot Discord (ativa bot + DM + agendador de lembretes)
DISCORD_BOT_TOKEN=__token_do_bot__

# Push FCM — opcional; vazio => inerte (a DM cobre as notificações)
FIREBASE_SERVICE_ACCOUNT=
```

> **Sobre `DISCORD_REDIRECT_URI`:** o valor acima é um chute inicial. O `flutter_web_auth_2` no web define a URL de callback esperada; confirmar na Task 7 qual URL exata registrar no Discord Portal e usar o mesmo valor aqui. Ver §6 do design.

- [ ] **Step 2: Commit**

```bash
git add backend/.env.production.example
git commit -m "docs(deploy): exemplo de variaveis de ambiente de producao"
```

---

## Task 6: Verificação integrada pré-deploy (local)

**Files:** nenhum (só verificação).

- [ ] **Step 1: Backend — build + testes**

Run: `cd backend && npm run build && npm test`
Expected: build limpo; **211 testes** passam.

- [ ] **Step 2: App — analyze + testes**

Run: `cd app && flutter analyze && flutter test`
Expected: `No issues found!`; todos os testes passam (incluindo os 4 novos da Task 1).

- [ ] **Step 3: (se Docker ligado) Build das duas imagens** *(requer Docker ligado)*

Run:
```bash
cd backend && docker build -t holoraid-backend:test .
cd .. && docker build -f web/Dockerfile -t holoraid-web:test .
```
Expected: ambas concluem. Se o Docker estiver desligado, registrar que a verificação de imagem fica para o EasyPanel.

- [ ] **Step 4: Marcar o design como pronto para deploy**

Nenhum commit de código. Seguir para a Task 7 (execução no painel), que é manual/assistida.

---

## Task 7: Deploy no EasyPanel (runbook manual/assistido)

**Files:** nenhum (operação no painel + DNS + Discord Portal). Esta task não tem TDD; é um checklist de execução.

- [ ] **Step 1: Projeto + serviço MySQL**

- Criar projeto `holoraid` no EasyPanel.
- Adicionar serviço **MySQL** (template) com: `MYSQL_DATABASE=holoraid`, `MYSQL_USER=holoraid`, `MYSQL_PASSWORD=<segredo>`, `MYSQL_ROOT_PASSWORD=<segredo>` e **volume persistente** em `/var/lib/mysql`.
- Subir e confirmar saudável. Anotar o **nome interno** do serviço (para `DB_HOST`).

- [ ] **Step 2: Serviço backend**

- Novo serviço **App** → source = repo Git, branch de deploy, **Build = Dockerfile**, dockerfile path `backend/Dockerfile`, **build context `backend/`**.
- Preencher **todas** as envs de `backend/.env.production.example` com os valores reais (`DB_HOST` = nome do serviço MySQL).
- **Sem domínio público** (só porta interna 3000).
- Deploy. Nos logs, confirmar: `[entrypoint] aplicando migrations...` → `OK: 001_init` … `OK: 007_foreign_keys` → `HoloRaid backend (HTTP+Socket.IO+Discord) ouvindo em :3000`.

- [ ] **Step 3: Serviço web**

- Novo serviço **App** → source = repo Git, branch de deploy, **Build = Dockerfile**, dockerfile path `web/Dockerfile`, **build context = raiz do repo** (para enxergar `app/` e `web/`).
- Se o `proxy_pass` do Nginx (`http://backend:3000`) não resolver, ajustar o hostname para o nome real do serviço backend (Step 2) e re-deployar.
- Domínio: `holoraid.fun` → porta 80. Ativar SSL (Let's Encrypt).

- [ ] **Step 4: DNS**

- Apontar `holoraid.fun` (registro A/AAAA) para o IP da VPS. Aguardar propagação e emissão do certificado.

- [ ] **Step 5: Discord Developer Portal**

- Em OAuth2 → Redirects, adicionar o valor de `DISCORD_REDIRECT_URI` (o que o web usa). Manter `holoraid://auth` se o app mobile for usado.
- Confirmar que **"URL de endpoint de interações" está VAZIA**.
- ToS = `https://holoraid.fun/terms`, Privacy = `https://holoraid.fun/privacy`.

- [ ] **Step 6: Validação pós-deploy (smokes reais)**

- [ ] `https://holoraid.fun/` carrega o app; SSL válido.
- [ ] `https://holoraid.fun/api/health` → `{"ok":true}` (prova proxy + strip).
- [ ] `https://holoraid.fun/terms` e `/privacy` renderizam.
- [ ] **Login OAuth web** completo (o teste do risco §6 do design). Se falhar por `redirect_uri mismatch` ou o callback não capturar o `code`, aplicar o fast-follow: redirect por plataforma (`/auth/discord/url?platform=web`, envs `DISCORD_REDIRECT_URI_WEB`/`_MOBILE`).
- [ ] **Socket ao vivo:** duas abas; join numa raid reflete na outra.
- [ ] **Bot Discord:** `/set_raid_channel` + `/create_raid` num servidor de teste; embed com `@here` posta; botões Join/Leave funcionam.
- [ ] **DM:** um leave que promove da waitlist gera DM.
- [ ] Banco: `SELECT COUNT(*) FROM bosses;` = 105.

---

## Pós-plano (fora do escopo deste deploy inicial)

- Configurar **backups** do MySQL no EasyPanel.
- Criar a caixa `contato@holoraid.fun` (citada nas páginas legais) ou trocar o contato.
- Ativar FCM depois (popular `FIREBASE_SERVICE_ACCOUNT`) + Task 8 do #6 (Flutter push, exige `flutterfire configure`).
- Distribuição do APK Android (não entra na VPS).
- Migrar o build do Flutter Web para GitHub Actions se os deploys ficarem lentos (o `web/Dockerfile` é reaproveitável no CI).
