# Fundação & Segurança — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o esqueleto de autenticação (Discord OAuth2), autorização (RBAC user/admin) e hardening do RaidSync — um backend TypeScript + uma fatia fina de login Flutter que prova o fluxo fim-a-fim.

**Architecture:** Monólito modular Express + TypeScript, fatiado por feature (router → controller → service → repository). Services recebem repositórios por injeção; a app é montada por uma fábrica `createApp(deps)`, permitindo testar rotas com repos falsos sem MySQL. Acesso ao MySQL via Kysely (queries tipadas e parametrizadas). Tokens híbridos: access JWT curto + refresh rotativo revogável com detecção de reuso.

**Tech Stack:** Node 20+, TypeScript, Express, Kysely + mysql2, Zod, jsonwebtoken, helmet, cors, express-rate-limit, cookie-parser, pino, vitest + supertest. Flutter (Riverpod, GoRouter, Dio, flutter_secure_storage, flutter_web_auth_2).

## Global Constraints

- **Login aberto**: qualquer conta Discord loga; sem gating por servidor.
- **RBAC**: papéis `user` (padrão) e `admin`. Admin semeado por `ADMIN_DISCORD_IDS`; promovível/rebaixável pelo painel, sempre gravando em `admin_audit_log`.
- **Access token**: JWT, TTL padrão `15m`, claims mínimas `{ sub, role }`, Bearer.
- **Refresh token**: opaco (32 bytes aleatórios), TTL padrão 30 dias, guardado **só como SHA-256** no DB, rotativo, com `family_id` para detecção de reuso.
- **Web**: refresh em cookie `httpOnly` + `Secure` + `SameSite=Lax`. Mobile/desktop: refresh no Flutter Secure Storage.
- **Nenhum segredo no client**: `DISCORD_CLIENT_SECRET` e `JWT_SECRET` só no backend.
- **Toda entrada validada com Zod; toda query parametrizada (Kysely).**
- **Config fail-fast**: env inválido derruba o processo no boot.
- **Erros nunca vazam stack/SQL ao client**; formato uniforme `{ error: { code, message } }`.
- Nomes de tabela em português (`usuarios`, `refresh_tokens`, `admin_audit_log`), conforme `context..md`.

---

## Mapa de arquivos

```
backend/
  package.json, tsconfig.json, vitest.config.ts, .env.example, .gitignore
  src/
    config/index.ts               # loadConfig + getConfig (Zod fail-fast)
    common/
      errors/AppError.ts          # hierarquia de erros
      middleware/errorHandler.ts  # errorHandler + notFoundHandler
      middleware/requestId.ts     # requestId + pino-http
      middleware/validate.ts      # validate(schema)
      logger/logger.ts            # instância pino
      security/jwt.ts             # signAccessToken / verifyAccessToken
      security/guards.ts          # requireAuth / requireAdmin
      security/tokens.ts          # geração/h& hash de refresh token + PKCE helpers
    db/
      schema.ts                   # interface DB (tipos das tabelas)
      db.ts                       # instância Kysely
      migrate.ts                  # runner de migrations
      migrations/001_init.ts      # usuarios, refresh_tokens, admin_audit_log
      repositories/userRepo.ts    # UserRepo (interface + impl Kysely)
      repositories/refreshTokenRepo.ts
    modules/
      auth/discord.ts             # buildAuthUrl / exchangeCode / fetchDiscordUser
      auth/auth.service.ts        # issueTokenPair / rotate / revoke / loginWithCode
      auth/auth.schemas.ts        # Zod dos payloads
      auth/auth.controller.ts
      auth/auth.router.ts
      users/users.service.ts      # getMe / promote / demote / list
      users/users.controller.ts
      users/users.router.ts
    app.ts                        # createApp(deps): monta Express
    server.ts                     # bootstrap: repos Kysely reais + createApp + listen
  tests/
    config.test.ts, errors.test.ts, validate.test.ts, jwt.test.ts,
    guards.test.ts, discord.test.ts, authService.test.ts,
    auth.routes.test.ts, users.routes.test.ts
    fakes/  # repos falsos em memória

app/  (Flutter)
  pubspec.yaml
  lib/
    main.dart
    core/config/app_config.dart
    core/auth/token_storage.dart      # abstração + impl secure/web
    core/auth/auth_service.dart
    core/auth/auth_providers.dart     # Riverpod
    core/auth/oauth_launcher.dart     # flutter_web_auth_2 + PKCE
    core/network/api_client.dart      # Dio + interceptors
    core/router/app_router.dart       # GoRouter + guarda
    features/login/login_screen.dart
    features/home/home_screen.dart
```

---

# FASE A — Backend

### Task 1: Scaffolding do backend

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.gitignore`
- Create: `backend/.env.example`
- Create: `backend/src/server.ts` (stub temporário)

**Interfaces:**
- Consumes: nada.
- Produces: projeto que instala, compila e roda testes (0 testes é OK).

- [ ] **Step 1: Criar `backend/package.json`**

```json
{
  "name": "raidsync-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "kysely": "^0.27.4",
    "mysql2": "^3.11.0",
    "pino": "^9.4.0",
    "pino-http": "^10.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^22.5.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Criar `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Criar `backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

- [ ] **Step 4: Criar `backend/.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 5: Criar `backend/.env.example`**

```
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://raid:raid@127.0.0.1:3306/raidsync
JWT_SECRET=troque-por-uma-string-aleatoria-de-32-ou-mais-caracteres
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
ADMIN_DISCORD_IDS=
CORS_ORIGINS=http://localhost:8080
```

- [ ] **Step 6: Criar stub `backend/src/server.ts`**

```ts
console.log('RaidSync backend — bootstrap pendente');
```

- [ ] **Step 7: Instalar e verificar**

Run: `cd backend && npm install && npm run build && npm test`
Expected: `npm run build` compila sem erros; `vitest` reporta "No test files found" (exit 0) ou 0 testes.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "chore(backend): scaffolding TypeScript + vitest"
```

---

### Task 2: Config com validação fail-fast

**Files:**
- Create: `backend/src/config/index.ts`
- Test: `backend/tests/config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — lança `Error` se inválido.
  - `getConfig(): AppConfig` — singleton lazy.
  - `type AppConfig` com: `NODE_ENV`, `PORT:number`, `DATABASE_URL:string`, `JWT_SECRET:string`, `ACCESS_TOKEN_TTL:string`, `REFRESH_TOKEN_TTL_DAYS:number`, `DISCORD_CLIENT_ID:string`, `DISCORD_CLIENT_SECRET:string`, `DISCORD_REDIRECT_URI:string`, `ADMIN_DISCORD_IDS:string[]`, `CORS_ORIGINS:string[]`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/config.test.ts`

```ts
import { loadConfig } from '../src/config';

const good = {
  DATABASE_URL: 'mysql://u:p@h:3306/db',
  JWT_SECRET: 'x'.repeat(32),
  DISCORD_CLIENT_ID: 'cid',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  ADMIN_DISCORD_IDS: '111, 222',
  CORS_ORIGINS: 'http://a.com,http://b.com',
};

describe('loadConfig', () => {
  it('parseia env válido e transforma listas', () => {
    const c = loadConfig(good as any);
    expect(c.PORT).toBe(3000);
    expect(c.ADMIN_DISCORD_IDS).toEqual(['111', '222']);
    expect(c.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('lança se JWT_SECRET é curto (fail-fast)', () => {
    expect(() => loadConfig({ ...good, JWT_SECRET: 'curto' } as any)).toThrow();
  });

  it('lança se falta DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = good;
    expect(() => loadConfig(rest as any)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: FAIL — `loadConfig` não existe.

- [ ] **Step 3: Implementar `backend/src/config/index.ts`**

```ts
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  ADMIN_DISCORD_IDS: z.string().default('').transform(csv),
  CORS_ORIGINS: z.string().default('').transform(csv),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Configuração de ambiente inválida: ${fields}`);
  }
  return parsed.data;
}

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/config backend/tests/config.test.ts
git commit -m "feat(config): env validado com Zod (fail-fast)"
```

---

### Task 3: Hierarquia de erros + handlers

**Files:**
- Create: `backend/src/common/errors/AppError.ts`
- Create: `backend/src/common/middleware/errorHandler.ts`
- Test: `backend/tests/errors.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Classe base `AppError(statusCode:number, code:string, message:string)` e subclasses `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError(details?)`.
  - `errorHandler(err, req, res, next)` — mapeia `AppError` → `{ error: { code, message } }`; qualquer outro erro → 500 genérico sem vazar stack.
  - `notFoundHandler(req, res)` — 404 `{ error: { code: 'NOT_FOUND', message } }`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/errors.test.ts`

```ts
import express from 'express';
import request from 'supertest';
import { ForbiddenError, AppError } from '../src/common/errors/AppError';
import { errorHandler, notFoundHandler } from '../src/common/middleware/errorHandler';

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.get('/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('mapeia AppError para status + código', async () => {
    const app = appWith((_req, _res) => { throw new ForbiddenError('sem permissão'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'sem permissão' } });
  });

  it('erro desconhecido vira 500 genérico sem stack', async () => {
    const app = appWith(() => { throw new Error('detalhe interno secreto'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Erro interno' } });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });

  it('rota inexistente vira 404', async () => {
    const app = appWith((_req, res) => res.send('ok'));
    const res = await request(app).get('/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('AppError é instância de Error', () => {
    expect(new AppError(400, 'X', 'y')).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/errors.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `backend/src/common/errors/AppError.ts`**

```ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Requisição inválida') { super(400, 'BAD_REQUEST', message); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') { super(401, 'UNAUTHORIZED', message); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão') { super(403, 'FORBIDDEN', message); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Não encontrado') { super(404, 'NOT_FOUND', message); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflito') { super(409, 'CONFLICT', message); }
}
export class ValidationError extends AppError {
  constructor(message = 'Payload inválido', details?: unknown) {
    super(422, 'VALIDATION', message, details);
  }
}
```

- [ ] **Step 4: Implementar `backend/src/common/middleware/errorHandler.ts`**

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../logger/logger';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, reqId: (req as any).id }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  logger.error({ err, reqId: (req as any).id }, 'Erro não tratado');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno' } });
};
```

- [ ] **Step 5: Implementar o logger mínimo** — `backend/src/common/logger/logger.ts`

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.token', '*.refreshToken'],
});
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/errors.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/src/common
git commit -m "feat(errors): hierarquia AppError + error handler sem vazamento"
```

---

### Task 4: Middleware de validação (Zod)

**Files:**
- Create: `backend/src/common/middleware/validate.ts`
- Test: `backend/tests/validate.test.ts`

**Interfaces:**
- Consumes: `ValidationError` (Task 3), `zod`.
- Produces: `validate(schema: { body?, query?, params? })` — valida e substitui `req.body/query/params` pelos dados parseados; em falha lança `ValidationError` com `details` do Zod.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/validate.test.ts`

```ts
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../src/common/middleware/validate';
import { errorHandler } from '../src/common/middleware/errorHandler';

function app() {
  const a = express();
  a.use(express.json());
  a.post('/echo', validate({ body: z.object({ nome: z.string().min(2) }) }), (req, res) =>
    res.json({ nome: (req.body as any).nome }));
  a.use(errorHandler);
  return a;
}

describe('validate', () => {
  it('passa payload válido', async () => {
    const res = await request(app()).post('/echo').send({ nome: 'Thiago' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Thiago');
  });

  it('rejeita payload inválido com 422', async () => {
    const res = await request(app()).post('/echo').send({ nome: 'T' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/validate.test.ts`
Expected: FAIL — `validate` não existe.

- [ ] **Step 3: Implementar `backend/src/common/middleware/validate.ts`**

```ts
import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/AppError';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(new ValidationError('Payload inválido', result.error.flatten()));
      }
      req[key] = result.data;
    }
    next();
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/validate.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/middleware/validate.ts backend/tests/validate.test.ts
git commit -m "feat(validation): middleware validate() com Zod"
```

---

### Task 5: Serviço de JWT (access token)

**Files:**
- Create: `backend/src/common/security/jwt.ts`
- Test: `backend/tests/jwt.test.ts`

**Interfaces:**
- Consumes: `getConfig` (Task 2), `jsonwebtoken`, `UnauthorizedError` (Task 3).
- Produces:
  - `type AccessClaims = { sub: number; role: 'user' | 'admin' }`.
  - `signAccessToken(claims: AccessClaims): string`.
  - `verifyAccessToken(token: string): AccessClaims` — lança `UnauthorizedError` se inválido/expirado.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/jwt.test.ts`

```ts
import { signAccessToken, verifyAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'cid';
  process.env.DISCORD_CLIENT_SECRET = 's';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

describe('jwt', () => {
  it('assina e verifica claims', () => {
    const token = signAccessToken({ sub: 42, role: 'admin' });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe(42);
    expect(claims.role).toBe('admin');
  });

  it('rejeita token adulterado', () => {
    const token = signAccessToken({ sub: 1, role: 'user' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  it('rejeita token de outro segredo', () => {
    const jwt = require('jsonwebtoken');
    const forjado = jwt.sign({ sub: 1, role: 'admin' }, 'segredo-errado');
    expect(() => verifyAccessToken(forjado)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/jwt.test.ts`
Expected: FAIL — `signAccessToken` não existe.

- [ ] **Step 3: Implementar `backend/src/common/security/jwt.ts`**

```ts
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config';
import { UnauthorizedError } from '../errors/AppError';

export type AccessClaims = { sub: number; role: 'user' | 'admin' };

export function signAccessToken(claims: AccessClaims): string {
  const cfg = getConfig();
  return jwt.sign(claims, cfg.JWT_SECRET, {
    expiresIn: cfg.ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const cfg = getConfig();
  try {
    const decoded = jwt.verify(token, cfg.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) throw new Error('claims inválidas');
    const { sub, role } = decoded as Record<string, unknown>;
    if (typeof sub !== 'number' || (role !== 'user' && role !== 'admin')) {
      throw new Error('claims inválidas');
    }
    return { sub, role };
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/jwt.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/security/jwt.ts backend/tests/jwt.test.ts
git commit -m "feat(security): serviço de JWT de access token"
```

---

### Task 6: Guards de autenticação e RBAC

**Files:**
- Create: `backend/src/common/security/guards.ts`
- Test: `backend/tests/guards.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`/`AccessClaims` (Task 5), `UnauthorizedError`/`ForbiddenError` (Task 3).
- Produces:
  - Augmentação `Express.Request.user?: AccessClaims`.
  - `requireAuth: RequestHandler` — extrai Bearer, valida, seta `req.user`; senão lança `UnauthorizedError`.
  - `requireAdmin: RequestHandler` — exige `req.user.role === 'admin'`; senão `ForbiddenError`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/guards.test.ts`

```ts
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../src/common/security/jwt';
import { requireAuth, requireAdmin } from '../src/common/security/guards';
import { errorHandler } from '../src/common/middleware/errorHandler';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'cid';
  process.env.DISCORD_CLIENT_SECRET = 's';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

function app() {
  const a = express();
  a.get('/me', requireAuth, (req, res) => res.json({ sub: (req as any).user.sub }));
  a.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

describe('guards', () => {
  it('nega sem token (401)', async () => {
    expect((await request(app()).get('/me')).status).toBe(401);
  });

  it('aceita token válido', async () => {
    const t = signAccessToken({ sub: 7, role: 'user' });
    const res = await request(app()).get('/me').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe(7);
  });

  it('nega user comum em rota admin (403)', async () => {
    const t = signAccessToken({ sub: 7, role: 'user' });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('aceita admin em rota admin', async () => {
    const t = signAccessToken({ sub: 1, role: 'admin' });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/guards.test.ts`
Expected: FAIL — guards não existem.

- [ ] **Step 3: Implementar `backend/src/common/security/guards.ts`**

```ts
import type { RequestHandler } from 'express';
import { verifyAccessToken, type AccessClaims } from './jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token ausente'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new ForbiddenError('Requer admin'));
  next();
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/guards.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/security/guards.ts backend/tests/guards.test.ts
git commit -m "feat(security): guards requireAuth/requireAdmin (deny-by-default)"
```

---

### Task 7: Helpers de token opaco + PKCE

**Files:**
- Create: `backend/src/common/security/tokens.ts`
- Test: `backend/tests/tokens.test.ts`

**Interfaces:**
- Consumes: `node:crypto`.
- Produces:
  - `generateRefreshToken(): string` — 32 bytes aleatórios em base64url.
  - `hashToken(raw: string): string` — SHA-256 hex.
  - `randomState(): string` — 16 bytes base64url (state OAuth).
  - `createPkcePair(): { verifier: string; challenge: string }` — challenge = base64url(SHA256(verifier)).

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/tokens.test.ts`

```ts
import { createHash } from 'node:crypto';
import { generateRefreshToken, hashToken, randomState, createPkcePair } from '../src/common/security/tokens';

describe('tokens', () => {
  it('gera refresh tokens únicos e não triviais', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('hashToken é SHA-256 hex determinístico', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashToken('abc')).toHaveLength(64);
  });

  it('PKCE: challenge é base64url(SHA256(verifier))', () => {
    const { verifier, challenge } = createPkcePair();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/tokens.test.ts`
Expected: FAIL — helpers não existem.

- [ ] **Step 3: Implementar `backend/src/common/security/tokens.ts`**

```ts
import { randomBytes, createHash } from 'node:crypto';

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function randomState(): string {
  return randomBytes(16).toString('base64url');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/tokens.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/security/tokens.ts backend/tests/tokens.test.ts
git commit -m "feat(security): helpers de refresh token opaco e PKCE"
```

---

### Task 8: Camada de banco (Kysely + schema + migrations)

**Files:**
- Create: `backend/src/db/schema.ts`
- Create: `backend/src/db/db.ts`
- Create: `backend/src/db/migrations/001_init.ts`
- Create: `backend/src/db/migrate.ts`

**Interfaces:**
- Consumes: `getConfig` (Task 2), `kysely`, `mysql2`.
- Produces:
  - `interface DB` com `usuarios`, `refresh_tokens`, `admin_audit_log` (tipos de coluna).
  - `db: Kysely<DB>` (instância real).
  - `migrateToLatest(): Promise<void>` executável via `npm run migrate`.

> **Nota de teste:** esta task é verificada por **compilação** + execução do migrate contra um MySQL local (documentado). Os testes de fluxo (Tasks 10–11) usam repos falsos e não precisam de banco.

- [ ] **Step 1: Implementar `backend/src/db/schema.ts`**

```ts
import type { Generated, ColumnType } from 'kysely';

type Created = ColumnType<Date, Date | string | undefined, never>;
type Updated = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsuariosTable {
  id: Generated<number>;
  discord_id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  email: string | null;
  role: 'user' | 'admin';
  created_at: Created;
  updated_at: Updated;
}

export interface RefreshTokensTable {
  id: Generated<number>;
  usuario_id: number;
  token_hash: string;
  family_id: string;
  device: string | null;
  expires_at: ColumnType<Date, Date | string, never>;
  revoked_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Created;
}

export interface AdminAuditLogTable {
  id: Generated<number>;
  actor_id: number;
  action: string;
  target_id: number | null;
  metadata: ColumnType<unknown, string | null, string | null>;
  created_at: Created;
}

export interface DB {
  usuarios: UsuariosTable;
  refresh_tokens: RefreshTokensTable;
  admin_audit_log: AdminAuditLogTable;
}
```

- [ ] **Step 2: Implementar `backend/src/db/db.ts`**

```ts
import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import { getConfig } from '../config';
import type { DB } from './schema';

export function createDb(): Kysely<DB> {
  const dialect = new MysqlDialect({
    pool: createPool({ uri: getConfig().DATABASE_URL, connectionLimit: 10 }),
  });
  return new Kysely<DB>({ dialect });
}

export const db = createDb();
```

- [ ] **Step 3: Implementar `backend/src/db/migrations/001_init.ts`**

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('usuarios')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('discord_id', 'varchar(32)', (c) => c.notNull().unique())
    .addColumn('username', 'varchar(255)', (c) => c.notNull())
    .addColumn('nickname', 'varchar(255)')
    .addColumn('avatar', 'varchar(255)')
    .addColumn('email', 'varchar(255)')
    .addColumn('role', sql`enum('user','admin')`, (c) => c.notNull().defaultTo('user'))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('refresh_tokens')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) =>
      c.notNull().references('usuarios.id').onDelete('cascade'))
    .addColumn('token_hash', 'char(64)', (c) => c.notNull())
    .addColumn('family_id', 'char(36)', (c) => c.notNull())
    .addColumn('device', 'varchar(255)')
    .addColumn('expires_at', 'datetime', (c) => c.notNull())
    .addColumn('revoked_at', 'datetime')
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema.createIndex('idx_rt_usuario').on('refresh_tokens').column('usuario_id').execute();
  await db.schema.createIndex('idx_rt_hash').on('refresh_tokens').column('token_hash').execute();
  await db.schema.createIndex('idx_rt_family').on('refresh_tokens').column('family_id').execute();

  await db.schema
    .createTable('admin_audit_log')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('actor_id', 'bigint', (c) => c.notNull().references('usuarios.id'))
    .addColumn('action', 'varchar(64)', (c) => c.notNull())
    .addColumn('target_id', 'bigint')
    .addColumn('metadata', 'json')
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('admin_audit_log').ifExists().execute();
  await db.schema.dropTable('refresh_tokens').ifExists().execute();
  await db.schema.dropTable('usuarios').ifExists().execute();
}
```

- [ ] **Step 4: Implementar `backend/src/db/migrate.ts`**

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Migrator, FileMigrationProvider } from 'kysely';
import { db } from './db';

export async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((r) => {
    console.log(`${r.status === 'Success' ? 'OK' : 'FALHA'}: ${r.migrationName}`);
  });
  if (error) {
    console.error('Migration falhou:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  migrateToLatest().then(() => db.destroy());
}
```

- [ ] **Step 5: Verificar compilação**

Run: `cd backend && npm run build`
Expected: compila sem erros de tipo.

- [ ] **Step 6: (Integração — precisa de MySQL) rodar o migrate**

Suba um MySQL local (ex.: `docker run --name raid-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=raidsync -p 3306:3306 -d mysql:8`), ajuste `DATABASE_URL` no `.env`, então:
Run: `cd backend && npm run migrate`
Expected: `OK: 001_init` e as três tabelas criadas.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db
git commit -m "feat(db): schema Kysely + migration inicial (usuarios/refresh_tokens/audit)"
```

---

### Task 9: Repositórios (interfaces + impl Kysely + fakes)

**Files:**
- Create: `backend/src/db/repositories/userRepo.ts`
- Create: `backend/src/db/repositories/refreshTokenRepo.ts`
- Create: `backend/tests/fakes/fakeRepos.ts`

**Interfaces:**
- Consumes: `db`/`DB` (Task 8).
- Produces:
  - `type UserRecord = { id:number; discord_id:string; username:string; nickname:string|null; avatar:string|null; email:string|null; role:'user'|'admin' }`.
  - `interface UserRepo { upsertByDiscordId(p): Promise<UserRecord>; findById(id): Promise<UserRecord|null>; updateRole(id, role): Promise<void>; list(): Promise<UserRecord[]> }` onde `p = { discord_id, username, nickname, avatar, email, role }`.
  - `interface RefreshTokenRepo { create(row): Promise<void>; findByHash(hash): Promise<RefreshRecord|null>; revokeById(id): Promise<void>; revokeFamily(familyId): Promise<void> }` onde `RefreshRecord = { id:number; usuario_id:number; family_id:string; expires_at:Date; revoked_at:Date|null }` e `row = { usuario_id, token_hash, family_id, device, expires_at }`.
  - `createUserRepo(db): UserRepo`, `createRefreshTokenRepo(db): RefreshTokenRepo`.
  - Fakes: `makeFakeUserRepo()`, `makeFakeRefreshTokenRepo()` retornando as mesmas interfaces sobre arrays em memória.

- [ ] **Step 1: Implementar `backend/src/db/repositories/userRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Role = 'user' | 'admin';
export type UserRecord = {
  id: number; discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};
export type UpsertUser = {
  discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};

export interface UserRepo {
  upsertByDiscordId(p: UpsertUser): Promise<UserRecord>;
  findById(id: number): Promise<UserRecord | null>;
  updateRole(id: number, role: Role): Promise<void>;
  list(): Promise<UserRecord[]>;
}

const COLS = ['id', 'discord_id', 'username', 'nickname', 'avatar', 'email', 'role'] as const;

export function createUserRepo(db: Kysely<DB>): UserRepo {
  return {
    async upsertByDiscordId(p) {
      await db
        .insertInto('usuarios')
        .values({ ...p, updated_at: new Date() })
        .onDuplicateKeyUpdate({
          username: p.username, nickname: p.nickname, avatar: p.avatar,
          email: p.email, updated_at: new Date(),
        })
        .execute();
      const row = await db.selectFrom('usuarios').select(COLS)
        .where('discord_id', '=', p.discord_id).executeTakeFirstOrThrow();
      return row as UserRecord;
    },
    async findById(id) {
      const row = await db.selectFrom('usuarios').select(COLS).where('id', '=', id).executeTakeFirst();
      return (row as UserRecord) ?? null;
    },
    async updateRole(id, role) {
      await db.updateTable('usuarios').set({ role, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async list() {
      const rows = await db.selectFrom('usuarios').select(COLS).orderBy('id').execute();
      return rows as UserRecord[];
    },
  };
}
```

> **Nota:** o `onDuplicateKeyUpdate` deliberadamente **não** atualiza `role` — o papel só muda por promoção/rebaixamento explícito (Task 11), nunca por re-login.

- [ ] **Step 2: Implementar `backend/src/db/repositories/refreshTokenRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type RefreshRecord = {
  id: number; usuario_id: number; family_id: string; expires_at: Date; revoked_at: Date | null;
};
export type NewRefresh = {
  usuario_id: number; token_hash: string; family_id: string; device: string | null; expires_at: Date;
};

export interface RefreshTokenRepo {
  create(row: NewRefresh): Promise<void>;
  findByHash(hash: string): Promise<RefreshRecord | null>;
  revokeById(id: number): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export function createRefreshTokenRepo(db: Kysely<DB>): RefreshTokenRepo {
  return {
    async create(row) {
      await db.insertInto('refresh_tokens').values(row).execute();
    },
    async findByHash(hash) {
      const row = await db.selectFrom('refresh_tokens')
        .select(['id', 'usuario_id', 'family_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', hash).executeTakeFirst();
      return (row as RefreshRecord) ?? null;
    },
    async revokeById(id) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', id).execute();
    },
    async revokeFamily(familyId) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
        .where('family_id', '=', familyId).where('revoked_at', 'is', null).execute();
    },
  };
}
```

- [ ] **Step 3: Implementar fakes** — `backend/tests/fakes/fakeRepos.ts`

```ts
import type { UserRepo, UserRecord } from '../../src/db/repositories/userRepo';
import type { RefreshTokenRepo, RefreshRecord, NewRefresh } from '../../src/db/repositories/refreshTokenRepo';

export function makeFakeUserRepo(): UserRepo {
  const users: UserRecord[] = [];
  let seq = 1;
  return {
    async upsertByDiscordId(p) {
      const existing = users.find((u) => u.discord_id === p.discord_id);
      if (existing) {
        Object.assign(existing, { username: p.username, nickname: p.nickname, avatar: p.avatar, email: p.email });
        return { ...existing };
      }
      const rec: UserRecord = { id: seq++, ...p };
      users.push(rec);
      return { ...rec };
    },
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async updateRole(id, role) { const u = users.find((x) => x.id === id); if (u) u.role = role; },
    async list() { return users.map((u) => ({ ...u })); },
  };
}

export function makeFakeRefreshTokenRepo(): RefreshTokenRepo & { _rows: (NewRefresh & { id: number; revoked_at: Date | null })[] } {
  const rows: (NewRefresh & { id: number; revoked_at: Date | null })[] = [];
  let seq = 1;
  return {
    _rows: rows,
    async create(row) { rows.push({ ...row, id: seq++, revoked_at: null }); },
    async findByHash(hash) {
      const r = rows.find((x) => x.token_hash === hash);
      return r ? ({ id: r.id, usuario_id: r.usuario_id, family_id: r.family_id, expires_at: r.expires_at, revoked_at: r.revoked_at } as RefreshRecord) : null;
    },
    async revokeById(id) { const r = rows.find((x) => x.id === id); if (r) r.revoked_at = new Date(); },
    async revokeFamily(familyId) { rows.filter((x) => x.family_id === familyId && !x.revoked_at).forEach((x) => (x.revoked_at = new Date())); },
  };
}
```

- [ ] **Step 4: Verificar compilação**

Run: `cd backend && npm run build`
Expected: compila sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/repositories backend/tests/fakes
git commit -m "feat(db): repositórios UserRepo/RefreshTokenRepo + fakes"
```

---

### Task 10: Serviço Discord OAuth

**Files:**
- Create: `backend/src/modules/auth/discord.ts`
- Test: `backend/tests/discord.test.ts`

**Interfaces:**
- Consumes: `getConfig` (Task 2), `UnauthorizedError`/`BadRequestError` (Task 3), `fetch` global (Node 20+).
- Produces:
  - `buildAuthUrl(state: string, codeChallenge: string): string`.
  - `type DiscordProfile = { id:string; username:string; avatar:string|null; email:string|null }`.
  - `exchangeCodeForProfile(code: string, codeVerifier: string): Promise<DiscordProfile>` — troca code por token e busca `/users/@me`; lança `UnauthorizedError` em falha.
  - Injetável: a função aceita um `deps.fetch` opcional para teste (default = global `fetch`).

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/discord.test.ts`

```ts
import { buildAuthUrl, exchangeCodeForProfile } from '../src/modules/auth/discord';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

describe('discord', () => {
  it('monta URL de consentimento com PKCE e state', () => {
    const url = new URL(buildAuthUrl('st4te', 'chall'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('code_challenge')).toBe('chall');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('identify');
  });

  it('troca code por perfil', async () => {
    const fakeFetch = async (input: any): Promise<any> => {
      const u = String(input);
      if (u.includes('/oauth2/token')) return { ok: true, json: async () => ({ access_token: 'AT' }) };
      if (u.includes('/users/@me')) return { ok: true, json: async () => ({ id: '42', username: 'thi', avatar: 'abc', email: 'e@x.com' }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const p = await exchangeCodeForProfile('code', 'verifier', { fetch: fakeFetch as any });
    expect(p).toEqual({ id: '42', username: 'thi', avatar: 'abc', email: 'e@x.com' });
  });

  it('lança se o Discord recusa o code', async () => {
    const fakeFetch = async (): Promise<any> => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    await expect(exchangeCodeForProfile('bad', 'v', { fetch: fakeFetch as any })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discord.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/modules/auth/discord.ts`**

```ts
import { getConfig } from '../../config';
import { UnauthorizedError } from '../../common/errors/AppError';

const AUTH_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const ME_URL = 'https://discord.com/api/users/@me';

export type DiscordProfile = { id: string; username: string; avatar: string | null; email: string | null };
type Deps = { fetch?: typeof fetch };

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    client_id: cfg.DISCORD_CLIENT_ID,
    redirect_uri: cfg.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'none',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForProfile(
  code: string,
  codeVerifier: string,
  deps: Deps = {},
): Promise<DiscordProfile> {
  const cfg = getConfig();
  const doFetch = deps.fetch ?? fetch;

  const tokenRes = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      client_secret: cfg.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.DISCORD_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new UnauthorizedError('Falha ao trocar o code do Discord');
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new UnauthorizedError('Discord não retornou access_token');

  const meRes = await doFetch(ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!meRes.ok) throw new UnauthorizedError('Falha ao buscar perfil do Discord');
  const me = (await meRes.json()) as { id: string; username: string; avatar: string | null; email?: string | null };

  return { id: me.id, username: me.username, avatar: me.avatar ?? null, email: me.email ?? null };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/discord.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/discord.ts backend/tests/discord.test.ts
git commit -m "feat(auth): serviço Discord OAuth (URL PKCE + troca de code)"
```

---

### Task 11: Serviço de auth (emitir, rotacionar, revogar, login)

**Files:**
- Create: `backend/src/modules/auth/auth.service.ts`
- Test: `backend/tests/authService.test.ts`

**Interfaces:**
- Consumes: `UserRepo` (Task 9), `RefreshTokenRepo` (Task 9), `signAccessToken` (Task 5), `generateRefreshToken`/`hashToken` (Task 7), `exchangeCodeForProfile`/`DiscordProfile` (Task 10), `getConfig` (Task 2), `UnauthorizedError` (Task 3).
- Produces `createAuthService(deps)` onde `deps = { userRepo, refreshRepo, config, exchange? }`, retornando:
  - `loginWithCode(code, codeVerifier, device): Promise<TokenPair & { user: UserRecord }>` — resolve perfil Discord, faz upsert (papel = admin se `discord_id ∈ ADMIN_DISCORD_IDS`, senão user), emite par.
  - `rotate(rawRefresh, device): Promise<TokenPair>` — valida hash; se ausente/expirado/revogado → `UnauthorizedError`; **se revogado, revoga a família (detecção de reuso)**; senão revoga o atual e emite novo par na mesma família.
  - `revoke(rawRefresh): Promise<void>` — revoga o refresh atual (logout).
  - `type TokenPair = { accessToken: string; refreshToken: string; refreshExpiresAt: Date }`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/authService.test.ts`

```ts
import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';
import { verifyAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

function makeService(adminIds: string[] = []) {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const exchange = async () => ({ id: '999', username: 'thi', avatar: null, email: 'e@x.com' });
  const svc = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: adminIds, REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange,
  });
  return { svc, userRepo, refreshRepo };
}

describe('authService', () => {
  it('loginWithCode cria user e emite par válido', async () => {
    const { svc } = makeService();
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    expect(verifyAccessToken(pair.accessToken).role).toBe('user');
    expect(pair.refreshToken).toBeTruthy();
  });

  it('semente de admin promove no login', async () => {
    const { svc } = makeService(['999']);
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    expect(verifyAccessToken(pair.accessToken).role).toBe('admin');
  });

  it('rotate emite novo par e invalida o antigo', async () => {
    const { svc } = makeService();
    const first = await svc.loginWithCode('code', 'verifier', 'web');
    const second = await svc.rotate(first.refreshToken, 'web');
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(svc.rotate(first.refreshToken, 'web')).rejects.toThrow(); // reuso do antigo falha
  });

  it('reuso de token revogado revoga a família inteira', async () => {
    const { svc } = makeService();
    const first = await svc.loginWithCode('code', 'verifier', 'web');
    const second = await svc.rotate(first.refreshToken, 'web'); // revoga first
    await expect(svc.rotate(first.refreshToken, 'web')).rejects.toThrow(); // reuso -> revoga família
    await expect(svc.rotate(second.refreshToken, 'web')).rejects.toThrow(); // agora o válido também morreu
  });

  it('revoke (logout) invalida o refresh', async () => {
    const { svc } = makeService();
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    await svc.revoke(pair.refreshToken);
    await expect(svc.rotate(pair.refreshToken, 'web')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/authService.test.ts`
Expected: FAIL — `createAuthService` não existe.

- [ ] **Step 3: Implementar `backend/src/modules/auth/auth.service.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { UserRepo, UserRecord } from '../../db/repositories/userRepo';
import type { RefreshTokenRepo } from '../../db/repositories/refreshTokenRepo';
import { signAccessToken } from '../../common/security/jwt';
import { generateRefreshToken, hashToken } from '../../common/security/tokens';
import { exchangeCodeForProfile, type DiscordProfile } from './discord';
import { UnauthorizedError } from '../../common/errors/AppError';

export type TokenPair = { accessToken: string; refreshToken: string; refreshExpiresAt: Date };

type Deps = {
  userRepo: UserRepo;
  refreshRepo: RefreshTokenRepo;
  config: { ADMIN_DISCORD_IDS: string[]; REFRESH_TOKEN_TTL_DAYS: number };
  exchange?: (code: string, verifier: string) => Promise<DiscordProfile>;
  now?: () => Date;
};

export function createAuthService(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const exchange = deps.exchange ?? exchangeCodeForProfile;

  async function issue(user: UserRecord, familyId: string, device: string | null): Promise<TokenPair> {
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(now().getTime() + deps.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await deps.refreshRepo.create({
      usuario_id: user.id,
      token_hash: hashToken(refreshToken),
      family_id: familyId,
      device,
      expires_at: refreshExpiresAt,
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  return {
    async loginWithCode(code: string, codeVerifier: string, device: string | null): Promise<TokenPair & { user: UserRecord }> {
      const profile = await exchange(code, codeVerifier);
      const role = deps.config.ADMIN_DISCORD_IDS.includes(profile.id) ? 'admin' : 'user';
      const user = await deps.userRepo.upsertByDiscordId({
        discord_id: profile.id,
        username: profile.username,
        nickname: null,
        avatar: profile.avatar,
        email: profile.email,
        role,
      });
      // Se já existia e está na semente, garante o papel admin.
      if (role === 'admin' && user.role !== 'admin') {
        await deps.userRepo.updateRole(user.id, 'admin');
        user.role = 'admin';
      }
      const pair = await issue(user, randomUUID(), device);
      return { ...pair, user };
    },

    async rotate(rawRefresh: string, device: string | null): Promise<TokenPair> {
      const rec = await deps.refreshRepo.findByHash(hashToken(rawRefresh));
      if (!rec) throw new UnauthorizedError('Refresh inválido');
      if (rec.revoked_at) {
        // Reuso de token já revogado: possível roubo → mata a família toda.
        await deps.refreshRepo.revokeFamily(rec.family_id);
        throw new UnauthorizedError('Refresh reutilizado — sessão revogada');
      }
      if (rec.expires_at.getTime() <= now().getTime()) throw new UnauthorizedError('Refresh expirado');

      const user = await deps.userRepo.findById(rec.usuario_id);
      if (!user) throw new UnauthorizedError('Usuário inexistente');

      await deps.refreshRepo.revokeById(rec.id);
      return issue(user, rec.family_id, device);
    },

    async revoke(rawRefresh: string): Promise<void> {
      const rec = await deps.refreshRepo.findByHash(hashToken(rawRefresh));
      if (rec && !rec.revoked_at) await deps.refreshRepo.revokeById(rec.id);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/authService.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts backend/tests/authService.test.ts
git commit -m "feat(auth): serviço de tokens com rotação e detecção de reuso"
```

---

### Task 12: App factory + hardening + rotas de auth (integração)

**Files:**
- Create: `backend/src/common/middleware/requestId.ts`
- Create: `backend/src/modules/auth/auth.schemas.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.router.ts`
- Create: `backend/src/app.ts`
- Test: `backend/tests/auth.routes.test.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 11), middlewares (Tasks 3-4), `getConfig` (Task 2).
- Produces:
  - `requestId: RequestHandler` — seta `req.id` (UUID) e header `X-Request-Id`.
  - `createApp(deps: { authService: AuthService }): Express` — monta middlewares na ordem segura e registra `authRouter` + `/health`. (A Task 13 **modifica** esta fábrica para também montar `usersRouter`, com `userService` opcional — por isso o teste desta task, que não passa `userService`, continua válido.)
  - Cookie de refresh na Web: nome `rs_rt`, `httpOnly`, `sameSite:'lax'`, `secure` em produção, `path:'/auth'`.

> Rotas de auth: `GET /auth/discord/url`, `POST /auth/callback`, `POST /auth/refresh`, `POST /auth/logout`. O `state`/PKCE `verifier` para Web podem ser gerados no client; nestas rotas o backend confia no par (code, code_verifier) enviado. (O `state` é validado no client Web; mobile usa `flutter_web_auth_2` que já casa o state.)

- [ ] **Step 1: Escrever o teste de integração que falha** — `backend/tests/auth.routes.test.ts`

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

function build(adminIds: string[] = []) {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const authService = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: adminIds, REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange: async () => ({ id: '999', username: 'thi', avatar: null, email: 'e@x.com' }),
  });
  return createApp({ authService });
}

describe('rotas de auth', () => {
  it('GET /auth/discord/url devolve url + state + verifier', async () => {
    const res = await request(build()).get('/auth/discord/url');
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('discord.com');
    expect(res.body.state).toBeTruthy();
    expect(res.body.codeVerifier).toBeTruthy();
  });

  it('POST /auth/callback emite access token e seta cookie de refresh', async () => {
    const res = await request(build()).post('/auth/callback').send({ code: 'c', codeVerifier: 'v' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']?.join(';')).toContain('rs_rt=');
  });

  it('POST /auth/callback inválido (sem code) dá 422', async () => {
    const res = await request(build()).post('/auth/callback').send({ codeVerifier: 'v' });
    expect(res.status).toBe(422);
  });

  it('fluxo refresh via cookie rotaciona', async () => {
    const app = build();
    const agent = request.agent(app);
    await agent.post('/auth/callback').send({ code: 'c', codeVerifier: 'v' });
    const res = await agent.post('/auth/refresh').send({});
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rota inexistente dá 404 no formato padrão', async () => {
    const res = await request(build()).get('/nada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/auth.routes.test.ts`
Expected: FAIL — `createApp` não existe.

- [ ] **Step 3: Implementar `backend/src/common/middleware/requestId.ts`**

```ts
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestId: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  (req as any).id = id;
  res.setHeader('X-Request-Id', id);
  next();
};
```

- [ ] **Step 4: Implementar `backend/src/modules/auth/auth.schemas.ts`**

```ts
import { z } from 'zod';

export const callbackSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  device: z.string().max(64).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(), // mobile/desktop enviam no body; Web usa cookie
  device: z.string().max(64).optional(),
});
```

- [ ] **Step 5: Implementar `backend/src/modules/auth/auth.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { getConfig } from '../../config';
import { randomState, createPkcePair } from '../../common/security/tokens';
import { buildAuthUrl } from './discord';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { AuthService } from './auth.service';

const COOKIE = 'rs_rt';

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: getConfig().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    expires,
  });
}

export function createAuthController(authService: AuthService) {
  return {
    getDiscordUrl(_req: Request, res: Response) {
      const state = randomState();
      const { verifier, challenge } = createPkcePair();
      res.json({ url: buildAuthUrl(state, challenge), state, codeVerifier: verifier });
    },

    async callback(req: Request, res: Response) {
      const { code, codeVerifier, device } = req.body as { code: string; codeVerifier: string; device?: string };
      const pair = await authService.loginWithCode(code, codeVerifier, device ?? 'web');
      setRefreshCookie(res, pair.refreshToken, pair.refreshExpiresAt);
      res.json({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: pair.user });
    },

    async refresh(req: Request, res: Response) {
      const body = req.body as { refreshToken?: string; device?: string };
      const raw = body.refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
      if (!raw) throw new UnauthorizedError('Refresh ausente');
      const pair = await authService.rotate(raw, body.device ?? 'web');
      setRefreshCookie(res, pair.refreshToken, pair.refreshExpiresAt);
      res.json({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });
    },

    async logout(req: Request, res: Response) {
      const raw = (req.body as { refreshToken?: string }).refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
      if (raw) await authService.revoke(raw);
      res.clearCookie(COOKIE, { path: '/auth' });
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 6: Implementar `backend/src/modules/auth/auth.router.ts`**

```ts
import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { callbackSchema, refreshSchema } from './auth.schemas';
import { createAuthController } from './auth.controller';
import type { AuthService } from './auth.service';

// Envolve handlers async para encaminhar rejeições ao errorHandler.
const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createAuthRouter(authService: AuthService): Router {
  const c = createAuthController(authService);
  const r = Router();
  r.get('/discord/url', wrap(c.getDiscordUrl));
  r.post('/callback', validate({ body: callbackSchema }), wrap(c.callback));
  r.post('/refresh', validate({ body: refreshSchema }), wrap(c.refresh));
  r.post('/logout', wrap(c.logout));
  return r;
}
```

- [ ] **Step 7: Implementar `backend/src/app.ts`**

```ts
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { getConfig } from './config';
import { logger } from './common/logger/logger';
import { requestId } from './common/middleware/requestId';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { createAuthRouter } from './modules/auth/auth.router';
import type { AuthService } from './modules/auth/auth.service';

export function createApp(deps: { authService: AuthService }): Express {
  const cfg = getConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as any).id }));
  app.use(helmet());
  app.use(cors({
    origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : false,
    credentials: true,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authLimiter, createAuthRouter(deps.authService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

> A Task 13 reabre este arquivo para injetar o `usersRouter`. Mantê-lo mínimo aqui deixa esta task compilável e testável por si só.

- [ ] **Step 8: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/auth.routes.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 9: Commit**

```bash
git add backend/src/app.ts backend/src/common/middleware/requestId.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.router.ts backend/src/modules/auth/auth.schemas.ts backend/tests/auth.routes.test.ts
git commit -m "feat(auth): app factory com hardening + rotas OAuth/refresh/logout"
```

---

### Task 13: Módulo de usuários (/me, promover, rebaixar, listar) + auditoria

**Files:**
- Create: `backend/src/modules/users/users.service.ts`
- Create: `backend/src/modules/users/users.controller.ts`
- Create: `backend/src/modules/users/users.router.ts`
- Modify: `backend/src/app.ts` (injeta o `usersRouter` na `createApp`)
- Test: `backend/tests/users.routes.test.ts`

**Interfaces:**
- Consumes: `UserRepo` (Task 9), guards (Task 6), `createApp` (Task 12), `signAccessToken` (Task 5, para teste), `NotFoundError`/`BadRequestError` (Task 3).
- Produces:
  - `createUserService(deps: { userRepo: UserRepo; auditLog: (e:{actor_id:number;action:string;target_id:number|null;metadata?:unknown}) => Promise<void> })`:
    - `getMe(userId): Promise<UserRecord>` (lança `NotFoundError`).
    - `promote(actorId, targetId): Promise<void>` (seta role admin, grava auditoria).
    - `demote(actorId, targetId): Promise<void>` (impede auto-rebaixamento → `BadRequestError`).
    - `list(): Promise<UserRecord[]>`.
  - `createUsersRouter(userService): Router` com `GET /me` (auth), `GET /users` (admin), `POST /users/:id/promote` (admin), `POST /users/:id/demote` (admin).
  - `type UserService = ReturnType<typeof createUserService>`.
  - `createApp` passa a aceitar `{ authService; userService? }` e monta `usersRouter` quando `userService` é fornecido (mantém o teste da Task 12 válido).

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/users.routes.test.ts`

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';
import { createUserService } from '../src/modules/users/users.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

async function build() {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const audits: any[] = [];
  const userService = createUserService({ userRepo, auditLog: async (e) => { audits.push(e); } });
  const authService = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: [], REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange: async () => ({ id: '1', username: 'user', avatar: null, email: null }),
  });
  // cria dois usuários: id 1 (user) e id 2 (admin)
  const u1 = await userRepo.upsertByDiscordId({ discord_id: '1', username: 'user', nickname: null, avatar: null, email: null, role: 'user' });
  const u2 = await userRepo.upsertByDiscordId({ discord_id: '2', username: 'boss', nickname: null, avatar: null, email: null, role: 'admin' });
  return { app: createApp({ authService, userService }), audits, u1, u2 };
}

describe('rotas de usuários', () => {
  it('GET /me devolve o próprio perfil', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.discord_id).toBe('1');
  });

  it('GET /me sem token dá 401', async () => {
    const { app } = await build();
    expect((await request(app).get('/me')).status).toBe(401);
  });

  it('user comum não lista usuários (403)', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    expect((await request(app).get('/users').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('admin promove outro usuário e grava auditoria', async () => {
    const { app, audits, u1, u2 } = await build();
    const token = signAccessToken({ sub: u2.id, role: 'admin' });
    const res = await request(app).post(`/users/${u1.id}/promote`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(audits.find((a) => a.action === 'promote' && a.target_id === u1.id)).toBeTruthy();
  });

  it('admin não pode se auto-rebaixar (400)', async () => {
    const { app, u2 } = await build();
    const token = signAccessToken({ sub: u2.id, role: 'admin' });
    const res = await request(app).post(`/users/${u2.id}/demote`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/users.routes.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `backend/src/modules/users/users.service.ts`**

```ts
import type { UserRepo, UserRecord } from '../../db/repositories/userRepo';
import { NotFoundError, BadRequestError } from '../../common/errors/AppError';

type AuditEvent = { actor_id: number; action: string; target_id: number | null; metadata?: unknown };
type Deps = { userRepo: UserRepo; auditLog: (e: AuditEvent) => Promise<void> };

export function createUserService(deps: Deps) {
  return {
    async getMe(userId: number): Promise<UserRecord> {
      const u = await deps.userRepo.findById(userId);
      if (!u) throw new NotFoundError('Usuário não encontrado');
      return u;
    },
    async list(): Promise<UserRecord[]> {
      return deps.userRepo.list();
    },
    async promote(actorId: number, targetId: number): Promise<void> {
      const target = await deps.userRepo.findById(targetId);
      if (!target) throw new NotFoundError('Usuário alvo não encontrado');
      await deps.userRepo.updateRole(targetId, 'admin');
      await deps.auditLog({ actor_id: actorId, action: 'promote', target_id: targetId });
    },
    async demote(actorId: number, targetId: number): Promise<void> {
      if (actorId === targetId) throw new BadRequestError('Você não pode rebaixar a si mesmo');
      const target = await deps.userRepo.findById(targetId);
      if (!target) throw new NotFoundError('Usuário alvo não encontrado');
      await deps.userRepo.updateRole(targetId, 'user');
      await deps.auditLog({ actor_id: actorId, action: 'demote', target_id: targetId });
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
```

- [ ] **Step 4: Implementar `backend/src/modules/users/users.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { UserService } from './users.service';

export function createUsersController(userService: UserService) {
  return {
    async me(req: Request, res: Response) {
      res.json(await userService.getMe(req.user!.sub));
    },
    async list(_req: Request, res: Response) {
      res.json(await userService.list());
    },
    async promote(req: Request, res: Response) {
      await userService.promote(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
    async demote(req: Request, res: Response) {
      await userService.demote(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 5: Implementar `backend/src/modules/users/users.router.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createUsersController } from './users.controller';
import type { UserService } from './users.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function createUsersRouter(userService: UserService): Router {
  const c = createUsersController(userService);
  const r = Router();
  r.get('/me', requireAuth, wrap(c.me));
  r.get('/users', requireAuth, requireAdmin, wrap(c.list));
  r.post('/users/:id/promote', requireAuth, requireAdmin, validate({ params: idParam }), wrap(c.promote));
  r.post('/users/:id/demote', requireAuth, requireAdmin, validate({ params: idParam }), wrap(c.demote));
  return r;
}
```

- [ ] **Step 6: Modificar `backend/src/app.ts` para montar o `usersRouter`**

Substituir o conteúdo por (adiciona import de users, `userService` opcional e a montagem condicional):

```ts
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { getConfig } from './config';
import { logger } from './common/logger/logger';
import { requestId } from './common/middleware/requestId';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { createAuthRouter } from './modules/auth/auth.router';
import { createUsersRouter } from './modules/users/users.router';
import type { AuthService } from './modules/auth/auth.service';
import type { UserService } from './modules/users/users.service';

export function createApp(deps: { authService: AuthService; userService?: UserService }): Express {
  const cfg = getConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as any).id }));
  app.use(helmet());
  app.use(cors({
    origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : false,
    credentials: true,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authLimiter, createAuthRouter(deps.authService));
  if (deps.userService) app.use('/', createUsersRouter(deps.userService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 7: Rodar e ver passar** (users + auth, agora que a app monta ambos)

Run: `cd backend && npx vitest run tests/users.routes.test.ts tests/auth.routes.test.ts`
Expected: PASS (todos).

- [ ] **Step 8: Rodar a suíte inteira**

Run: `cd backend && npm test`
Expected: todos os testes verdes.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/users backend/src/app.ts backend/tests/users.routes.test.ts
git commit -m "feat(users): /me + promover/rebaixar admin com auditoria (RBAC)"
```

---

### Task 14: Bootstrap real (server.ts) + smoke fim-a-fim

**Files:**
- Create: `backend/src/db/repositories/auditRepo.ts`
- Modify: `backend/src/server.ts` (substitui o stub)

**Interfaces:**
- Consumes: `createDb` (Task 8), repos reais (Task 9), `createAuthService`/`createUserService`, `createApp` (Task 12), `getConfig`.
- Produces: processo HTTP que escuta em `PORT`, com `auditLog` gravando em `admin_audit_log`.

> Verificado por smoke manual (precisa de MySQL + um app Discord OAuth configurado com redirect `http://localhost:3000/auth/callback`).

- [ ] **Step 1: Implementar `backend/src/db/repositories/auditRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export function createAuditLog(db: Kysely<DB>) {
  return async (e: { actor_id: number; action: string; target_id: number | null; metadata?: unknown }) => {
    await db.insertInto('admin_audit_log').values({
      actor_id: e.actor_id,
      action: e.action,
      target_id: e.target_id,
      metadata: e.metadata !== undefined ? JSON.stringify(e.metadata) : null,
    }).execute();
  };
}
```

- [ ] **Step 2: Implementar `backend/src/server.ts`**

```ts
import { getConfig } from './config';
import { createDb } from './db/db';
import { createUserRepo } from './db/repositories/userRepo';
import { createRefreshTokenRepo } from './db/repositories/refreshTokenRepo';
import { createAuditLog } from './db/repositories/auditRepo';
import { createAuthService } from './modules/auth/auth.service';
import { createUserService } from './modules/users/users.service';
import { createApp } from './app';
import { logger } from './common/logger/logger';

const cfg = getConfig(); // fail-fast: se env inválido, lança aqui
const db = createDb();

const userRepo = createUserRepo(db);
const refreshRepo = createRefreshTokenRepo(db);
const authService = createAuthService({
  userRepo, refreshRepo,
  config: { ADMIN_DISCORD_IDS: cfg.ADMIN_DISCORD_IDS, REFRESH_TOKEN_TTL_DAYS: cfg.REFRESH_TOKEN_TTL_DAYS },
});
const userService = createUserService({ userRepo, auditLog: createAuditLog(db) });

const app = createApp({ authService, userService });
app.listen(cfg.PORT, () => logger.info(`RaidSync backend ouvindo em :${cfg.PORT}`));
```

- [ ] **Step 3: Verificar compilação**

Run: `cd backend && npm run build`
Expected: compila sem erros.

- [ ] **Step 4: Smoke manual (MySQL + Discord app)**

1. `npm run migrate`
2. `npm run dev`
3. `curl http://localhost:3000/health` → `{"ok":true}`
4. `curl http://localhost:3000/auth/discord/url` → devolve `url`, `state`, `codeVerifier`. Abrir a `url` no navegador, autorizar, capturar `code` do redirect.
5. `curl -X POST http://localhost:3000/auth/callback -H 'Content-Type: application/json' -d '{"code":"<CODE>","codeVerifier":"<VERIFIER>"}'` → `accessToken` + `user`.
6. `curl http://localhost:3000/me -H "Authorization: Bearer <ACCESS>"` → perfil.
Expected: cada passo responde como descrito.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts backend/src/db/repositories/auditRepo.ts
git commit -m "feat(backend): bootstrap real com Kysely + smoke fim-a-fim"
```

---

# FASE B — Flutter (fatia fina de login)

> **Nota:** a fatia Flutter é um walking skeleton visual — verificada por execução manual em cada plataforma (não há testes de widget automatizados nesta fase). Requer o backend da Fase A rodando.

### Task 15: Scaffolding do app Flutter

**Files:**
- Create: `app/pubspec.yaml`
- Create: `app/lib/core/config/app_config.dart`
- Create: `app/lib/main.dart`

**Interfaces:**
- Consumes: nada.
- Produces: app Flutter que compila (`flutter run`) mostrando um placeholder; `AppConfig.apiBaseUrl` e `AppConfig.discordClientId` lidos via `--dart-define`.

- [ ] **Step 1: Criar o projeto Flutter**

Run: `cd app && flutter create . --platforms=android,windows,web --project-name raidsync`
Expected: estrutura Flutter criada.

- [ ] **Step 2: Definir dependências em `app/pubspec.yaml`** (na seção `dependencies`)

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  dio: ^5.6.0
  flutter_secure_storage: ^9.2.2
  flutter_web_auth_2: ^3.1.2
```

Run: `cd app && flutter pub get`
Expected: dependências resolvidas.

- [ ] **Step 3: Implementar `app/lib/core/config/app_config.dart`**

```dart
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
  static const discordClientId = String.fromEnvironment('DISCORD_CLIENT_ID');
  // Callback: Web usa a URL do SPA; mobile/desktop usam o scheme abaixo.
  static const oauthCallbackScheme = 'raidsync';
}
```

- [ ] **Step 4: Implementar `app/lib/main.dart` (placeholder temporário)**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: RaidSyncApp()));

class RaidSyncApp extends StatelessWidget {
  const RaidSyncApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'RaidSync',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
        home: const Scaffold(body: Center(child: Text('RaidSync — bootstrap'))),
      );
}
```

- [ ] **Step 5: Verificar execução**

Run: `cd app && flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000`
Expected: janela/aba abre mostrando "RaidSync — bootstrap".

- [ ] **Step 6: Commit**

```bash
git add app/pubspec.yaml app/lib/main.dart app/lib/core/config/app_config.dart
git commit -m "chore(app): scaffolding Flutter multiplataforma + config por dart-define"
```

---

### Task 16: Storage de token + cliente Dio com interceptors

**Files:**
- Create: `app/lib/core/auth/token_storage.dart`
- Create: `app/lib/core/network/api_client.dart`

**Interfaces:**
- Consumes: `AppConfig` (Task 15).
- Produces:
  - `abstract class TokenStorage { Future<void> saveRefresh(String?); Future<String?> readRefresh(); Future<void> clear(); String? accessToken; }` com impl `SecureTokenStorage` (mobile/desktop) e `MemoryTokenStorage` (web — refresh via cookie no servidor).
  - `ApiClient` com `Dio dio` configurado: baseUrl, `withCredentials` (web), interceptor que injeta `Authorization: Bearer <access>` e, em `401`, tenta `POST /auth/refresh` uma vez e repete a requisição; se falhar, chama `onSessionExpired`.

- [ ] **Step 1: Implementar `app/lib/core/auth/token_storage.dart`**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStorage {
  String? accessToken;
  Future<void> saveRefresh(String? token);
  Future<String?> readRefresh();
  Future<void> clear();

  factory TokenStorage.platform() =>
      kIsWeb ? MemoryTokenStorage() : SecureTokenStorage();
}

class MemoryTokenStorage implements TokenStorage {
  @override
  String? accessToken;
  // Na Web o refresh vive em cookie httpOnly — o app não o manuseia.
  @override
  Future<void> saveRefresh(String? token) async {}
  @override
  Future<String?> readRefresh() async => null;
  @override
  Future<void> clear() async => accessToken = null;
}

class SecureTokenStorage implements TokenStorage {
  final _storage = const FlutterSecureStorage();
  static const _key = 'rs_refresh';
  @override
  String? accessToken;
  @override
  Future<void> saveRefresh(String? token) async {
    if (token == null) return _storage.delete(key: _key);
    await _storage.write(key: _key, value: token);
  }
  @override
  Future<String?> readRefresh() => _storage.read(key: _key);
  @override
  Future<void> clear() async {
    accessToken = null;
    await _storage.delete(key: _key);
  }
}
```

- [ ] **Step 2: Implementar `app/lib/core/network/api_client.dart`**

```dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../auth/token_storage.dart';
import '../config/app_config.dart';

class ApiClient {
  final Dio dio;
  final TokenStorage storage;
  final Future<void> Function() onSessionExpired;

  ApiClient(this.storage, {required this.onSessionExpired})
      : dio = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)) {
    if (kIsWeb) {
      dio.options.extra['withCredentials'] = true; // envia cookie de refresh
    }
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final at = storage.accessToken;
        if (at != null) options.headers['Authorization'] = 'Bearer $at';
        handler.next(options);
      },
      onError: (e, handler) async {
        final isAuthCall = e.requestOptions.path.startsWith('/auth/');
        if (e.response?.statusCode == 401 &&
            e.requestOptions.extra['retried'] != true &&
            !isAuthCall) {
          try {
            final refresh = await storage.readRefresh();
            final res = await dio.post('/auth/refresh',
                data: {if (refresh != null) 'refreshToken': refresh});
            storage.accessToken = res.data['accessToken'] as String;
            if (res.data['refreshToken'] != null) {
              await storage.saveRefresh(res.data['refreshToken'] as String);
            }
            final req = e.requestOptions..extra['retried'] = true;
            req.headers['Authorization'] = 'Bearer ${storage.accessToken}';
            return handler.resolve(await dio.fetch(req));
          } catch (_) {
            await onSessionExpired();
          }
        }
        handler.next(e);
      },
    ));
  }
}
```

- [ ] **Step 3: Verificar compilação**

Run: `cd app && flutter analyze`
Expected: sem erros (avisos de estilo aceitáveis).

- [ ] **Step 4: Commit**

```bash
git add app/lib/core/auth/token_storage.dart app/lib/core/network/api_client.dart
git commit -m "feat(app): storage de token + Dio com refresh automático em 401"
```

---

### Task 17: Serviço de auth + OAuth launcher + providers Riverpod

**Files:**
- Create: `app/lib/core/auth/oauth_launcher.dart`
- Create: `app/lib/core/auth/auth_service.dart`
- Create: `app/lib/core/auth/auth_providers.dart`

**Interfaces:**
- Consumes: `ApiClient` (Task 16), `TokenStorage` (Task 16), `AppConfig` (Task 15), `flutter_web_auth_2`.
- Produces:
  - `startDiscordLogin(ApiClient): Future<void>` — chama `GET /auth/discord/url`, abre o consentimento com `FlutterWebAuth2`, extrai `code`, chama `POST /auth/callback` com `{code, codeVerifier}`, guarda access (e refresh no mobile).
  - `authStateProvider` (Riverpod `StateNotifier`) com estados `unknown / signedOut / signedIn(User)`; método `login()`, `logout()`, `loadMe()`.
  - `apiClientProvider`, `tokenStorageProvider`.

- [ ] **Step 1: Implementar `app/lib/core/auth/oauth_launcher.dart`**

```dart
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import '../network/api_client.dart';
import '../config/app_config.dart';

class OAuthResult {
  final String accessToken;
  final Map<String, dynamic> user;
  OAuthResult(this.accessToken, this.user);
}

/// Executa o fluxo OAuth completo e devolve o access token + user.
Future<OAuthResult> runDiscordOAuth(ApiClient api) async {
  final urlRes = await api.dio.get('/auth/discord/url');
  final authUrl = urlRes.data['url'] as String;
  final codeVerifier = urlRes.data['codeVerifier'] as String;

  final result = await FlutterWebAuth2.authenticate(
    url: authUrl,
    callbackUrlScheme: AppConfig.oauthCallbackScheme,
  );
  final code = Uri.parse(result).queryParameters['code'];
  if (code == null) throw Exception('Discord não retornou code');

  final cbRes = await api.dio.post('/auth/callback',
      data: {'code': code, 'codeVerifier': codeVerifier});
  return OAuthResult(
    cbRes.data['accessToken'] as String,
    (cbRes.data['user'] as Map).cast<String, dynamic>(),
  );
}
```

- [ ] **Step 2: Implementar `app/lib/core/auth/auth_service.dart`**

```dart
import '../network/api_client.dart';
import '../auth/token_storage.dart';
import 'oauth_launcher.dart';

class AuthService {
  final ApiClient api;
  final TokenStorage storage;
  AuthService(this.api, this.storage);

  Future<Map<String, dynamic>> login() async {
    final res = await runDiscordOAuth(api);
    storage.accessToken = res.accessToken;
    // Web recebe refresh via cookie; mobile/desktop via body seria adicionado aqui.
    return res.user;
  }

  Future<Map<String, dynamic>> loadMe() async {
    final res = await api.dio.get('/me');
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<void> logout() async {
    try { await api.dio.post('/auth/logout'); } catch (_) {}
    await storage.clear();
  }
}
```

- [ ] **Step 3: Implementar `app/lib/core/auth/auth_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../auth/token_storage.dart';
import 'auth_service.dart';

sealed class AuthState {
  const AuthState();
}
class AuthUnknown extends AuthState { const AuthUnknown(); }
class AuthSignedOut extends AuthState { const AuthSignedOut(); }
class AuthSignedIn extends AuthState {
  final Map<String, dynamic> user;
  const AuthSignedIn(this.user);
}

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage.platform());

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(tokenStorageProvider);
  return ApiClient(storage, onSessionExpired: () async {
    ref.read(authStateProvider.notifier).forceSignedOut();
  });
});

final authServiceProvider = Provider<AuthService>((ref) =>
    AuthService(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider)));

final authStateProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier(ref));

class AuthNotifier extends StateNotifier<AuthState> {
  final Ref ref;
  AuthNotifier(this.ref) : super(const AuthUnknown());

  Future<void> login() async {
    final user = await ref.read(authServiceProvider).login();
    state = AuthSignedIn(user);
  }

  Future<void> logout() async {
    await ref.read(authServiceProvider).logout();
    state = const AuthSignedOut();
  }

  void forceSignedOut() => state = const AuthSignedOut();
}
```

- [ ] **Step 4: Verificar compilação**

Run: `cd app && flutter analyze`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/lib/core/auth
git commit -m "feat(app): serviço de auth Discord + providers Riverpod"
```

---

### Task 18: Router com guarda + telas de login e home

**Files:**
- Create: `app/lib/core/router/app_router.dart`
- Create: `app/lib/features/login/login_screen.dart`
- Create: `app/lib/features/home/home_screen.dart`
- Modify: `app/lib/main.dart`

**Interfaces:**
- Consumes: `authStateProvider` (Task 17), `authServiceProvider` (Task 17).
- Produces: app navegável: `/login` (não autenticado) ↔ `/home` (autenticado, mostra `/me`), com botão de login (feedback `Scale 0.97`) e logout.

- [ ] **Step 1: Implementar `app/lib/features/login/login_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _loading = false;
  bool _pressed = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authStateProvider.notifier).login();
    } catch (e) {
      setState(() => _error = 'Falha no login: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('RaidSync', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 24),
            GestureDetector(
              onTapDown: (_) => setState(() => _pressed = true),
              onTapUp: (_) => setState(() => _pressed = false),
              onTapCancel: () => setState(() => _pressed = false),
              child: AnimatedScale(
                scale: _pressed ? 0.97 : 1.0,
                duration: const Duration(milliseconds: 150),
                child: FilledButton.icon(
                  onPressed: _loading ? null : _login,
                  icon: _loading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.login),
                  label: Text(_loading ? 'Entrando...' : 'Entrar com Discord'),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Implementar `app/lib/features/home/home_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(authStateProvider);
    final user = state is AuthSignedIn ? state.user : const <String, dynamic>{};
    return Scaffold(
      appBar: AppBar(
        title: const Text('RaidSync'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: Center(
        child: FutureBuilder<Map<String, dynamic>>(
          future: ref.read(authServiceProvider).loadMe(),
          builder: (context, snap) {
            if (!snap.hasData) return const CircularProgressIndicator();
            final me = snap.data!;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 32,
                  child: Text((me['username'] as String? ?? '?').substring(0, 1).toUpperCase()),
                ),
                const SizedBox(height: 12),
                Text(me['username'] as String? ?? 'sem nome',
                    style: Theme.of(context).textTheme.titleLarge),
                Text('Papel: ${me['role'] ?? '-'}'),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: Implementar `app/lib/core/router/app_router.dart`**

```dart
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import '../../features/login/login_screen.dart';
import '../../features/home/home_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/home',
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final signedIn = auth is AuthSignedIn;
      final onLogin = state.matchedLocation == '/login';
      if (!signedIn && !onLogin) return '/login';
      if (signedIn && onLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
    ],
  );
});
```

- [ ] **Step 4: Atualizar `app/lib/main.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';

void main() => runApp(const ProviderScope(child: RaidSyncApp()));

class RaidSyncApp extends ConsumerWidget {
  const RaidSyncApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'RaidSync',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 5: Verificação manual fim-a-fim (com o backend rodando)**

Run: `cd app && flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000 --dart-define=DISCORD_CLIENT_ID=<CID>`
Expected: abre em `/login` → clicar "Entrar com Discord" (botão encolhe para 0.97) → consentimento Discord → volta autenticado em `/home` mostrando avatar + username + papel; botão de logout retorna para `/login`.

> Para Android/Windows: registrar o redirect. Android — adicionar o intent-filter do scheme `raidsync` no `AndroidManifest.xml` (conforme README do `flutter_web_auth_2`). Windows/desktop — o `flutter_web_auth_2` usa loopback; configurar o redirect de loopback no app do Discord. Repetir o fluxo com `-d windows` / `-d android`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/core/router app/lib/features app/lib/main.dart
git commit -m "feat(app): login Discord fim-a-fim com guarda de rota (walking skeleton)"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (config, errors, validate, jwt, guards, tokens, discord, authService, auth.routes, users.routes).
- [ ] `cd backend && npm run build` — compila sem erros.
- [ ] `npm run migrate` cria as 3 tabelas num MySQL limpo.
- [ ] Smoke backend (Task 14) responde em `/health`, `/auth/*` e `/me`.
- [ ] App Flutter loga com Discord na Web e mostra o perfil em `/home` (Task 18).
- [ ] Nenhum segredo (`DISCORD_CLIENT_SECRET`, `JWT_SECRET`) referenciado no código Flutter.

---

## Self-review (cobertura do spec)

- Modelo de ameaças → controles: PKCE+state (Task 10), JWT assinado (Task 5), validação Zod (Task 4), queries parametrizadas Kysely (Tasks 8-9), Helmet/CORS/rate-limit (Task 12), auditoria (Tasks 13-14), rotação+reuso (Task 11), deny-by-default (Task 6). ✓
- Fluxo OAuth multiplataforma: URL+PKCE (Task 10), callback + cookie httpOnly Web (Task 12), launcher + scheme mobile/desktop (Tasks 17-18). ✓
- Modelo de dados (usuarios, refresh_tokens, admin_audit_log): Task 8. ✓
- RBAC user/admin semeado + promoção auditável: Tasks 11, 13. ✓
- Config fail-fast: Task 2. ✓
- Fatia Flutter (storage, Dio+refresh, Riverpod, GoRouter, login, home /me): Tasks 15-18. ✓
- Erros sem vazamento + logs redigidos: Tasks 3, e logger com `redact` (Task 3, Step 5). ✓
