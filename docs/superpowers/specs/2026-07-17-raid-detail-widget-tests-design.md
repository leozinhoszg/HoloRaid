# HoloRaid — Widget tests do raid_detail (gating de botões) — Design

- **Data:** 2026-07-17
- **Subsistema:** qualidade / testes de UI (2ª fatia de widget tests)
- **Depende de:** a fatia de widget tests anterior (harness `FakeRaidsRepository`, padrão de `ProviderScope` overrides), a `RaidDetailScreen` (gating de gestão do Painel Admin + Edição).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

A `RaidDetailScreen` ganhou (Painel Admin + Edição de raid) a lógica de **visibilidade dos
botões de gestão** — Editar/Iniciar/Encerrar/Cancelar/Duplicar/Excluir aparecem conforme
`iAmLeader || iAmAdmin` e o `status` da raid. Essa lógica condicional **não tem teste** e é
exatamente o tipo que quebra em silêncio.

Testá-la exige o degrau de infra que a fatia anterior deixou para depois: **fakear o socket e o
auth**. A `RaidDetailScreen`, no `build`, observa só dois providers — `raidDetailProvider(id)` e
`authStateProvider`. O `raidDetailProvider` usa o `socketServiceProvider` (que conecta socket
real) e o `raidsRepositoryProvider` (`get`). Então bastam três overrides: repo (canned raid),
socket (no-op), auth (quem sou eu). Essa infra **destrava testar raid list/detail em geral**.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alvo | Gating de botões da `RaidDetailScreen` (líder/admin/status). |
| Infra nova | `FakeSocketService` (no-op, `events` vazio) + `FakeAuthNotifier` (auth injetável) + helper `pumpRaidDetail`. Reutilizável. |
| Overrides | `raidsRepositoryProvider` (fake, `getResult`), `socketServiceProvider` (fake), `authStateProvider` (fake). O `raidDetailProvider` real roda por cima. |
| Escopo dos testes | **Visibilidade** dos botões — não a ação (o smoke do contrato já cobre update/delete no backend). |
| Sem dependência nova | Fakes à mão, como sempre. |

## Objetivos e critérios de sucesso

- `flutter test` verde: **4 testes novos** + os 6 atuais = 10.
- Cobrem os 4 cenários de gating:
  - comum → nenhum botão de gestão;
  - líder (OPEN) → todos os botões de gestão;
  - admin não-líder (OPEN) → todos (override de admin);
  - líder (RUNNING) → Editar/Iniciar ausentes, resto presente.
- `flutter analyze` limpo; backend 211 verdes (zero backend).
- Infra `FakeSocketService`/`FakeAuthNotifier`/`pumpRaidDetail` pronta para reuso.

## Fora de escopo

- Clicar os botões e verificar a ação (backend já coberto por testes + smoke).
- Testar o socket ao vivo / eventos em tempo real.
- Telas dio-direto (dashboard/profile/admin).
- Fluxo de Entrar/Sair (join) e seleção de personagem.

## Seção 1 — Infra (`app/test/support/`)

**`fake_socket_service.dart`** — `class FakeSocketService implements SocketService`:
- `Stream<RaidEvent> get events` → `const Stream.empty()` (broadcast não é necessário; o
  `.listen` do provider aceita).
- `subscribeRaid/unsubscribeRaid/subscribeLobby/unsubscribeLobby/connect/dispose` → no-op.
- `storage` (campo herdado da interface) → getter que lança `UnimplementedError` (não usado).

**`fake_auth_notifier.dart`** — `class FakeAuthNotifier extends AuthNotifier`:
```dart
FakeAuthNotifier(Ref ref, AuthState initial) : super(ref) { state = initial; }
```
(`state` é `@protected`, acessível na subclasse.) Herda login/logout (não chamados no teste).

**`pump_raid_detail.dart`** — helper:
```dart
Future<void> pumpRaidDetail(WidgetTester tester, {
  required Raid raid, required int authUserId, required String authRole,
});
```
Monta `FakeRaidsRepository()..getResult = raid`; um `GoRouter` (`/detail` → `RaidDetailScreen(id: raid.id)`);
um `ProviderScope(overrides: [raidsRepositoryProvider→fake, socketServiceProvider→FakeSocketService(),
authStateProvider.overrideWith((ref) => FakeAuthNotifier(ref, AuthSignedIn({'id': authUserId, 'role': authRole})))])`
em volta de `MaterialApp.router`. Viewport alto (o detail também é `ListView`). `pumpAndSettle`.

## Seção 2 — Testes (`app/test/features/raids/raid_detail_screen_test.dart`)

`Raid` canned com `createdBy: 100`, status parametrizável. Assertivas por texto de botão
(`find.text('Editar')`, `'Iniciar'`, `'Duplicar'`, `'Excluir'`, etc.):

1. **comum não vê gestão:** `authUserId: 999, authRole: 'user'`, status OPEN →
   `find.text('Editar')` `findsNothing`; idem Iniciar/Duplicar/Excluir. (Compartilhar presente.)
2. **líder vê tudo (OPEN):** `authUserId: 100, authRole: 'user'`, OPEN →
   Editar/Iniciar/Encerrar/Cancelar/Duplicar/Excluir todos `findsOneWidget`.
3. **admin não-líder vê tudo (OPEN):** `authUserId: 999, authRole: 'admin'`, OPEN →
   Editar/Duplicar/Excluir `findsOneWidget` (override de admin).
4. **líder RUNNING esconde OPEN-only:** `authUserId: 100`, status RUNNING →
   Editar `findsNothing`, Iniciar `findsNothing`; Encerrar/Cancelar/Duplicar/Excluir `findsOneWidget`.

> Nota: os botões usam `TextButton`/`OutlinedButton`; asserir por `find.text` é suficiente e
> robusto (o texto é único por botão). "Compartilhar" existe sempre (não é gestão).

## Seção 3 — Segurança & verificação

Não há superfície de segurança. Verificação:
- **`flutter test`** verde: 10 testes (6 atuais + 4 novos).
- **`flutter analyze`** limpo.
- **Backend:** 211 verdes (nada de backend muda).

## Riscos e questões em aberto

- **`implements SocketService`** obriga cobrir todos os membros públicos + o campo `storage`
  (vira getter que lança). Se um teste futuro tocar um método não previsto, falha clara.
- **`FakeAuthNotifier extends AuthNotifier`**: o construtor de `AuthNotifier(this.ref)` guarda o
  `ref`; login/logout leem outros providers, mas não são chamados nos testes de gating.
- **`Stream.empty()` para `events`**: o `raidDetailProvider` faz `.listen`; um stream vazio
  fecha imediatamente — o `onDispose(sub.cancel)` lida com isso sem erro.
- **Viewport:** o detail é `ListView`; usar o mesmo viewport alto do harness anterior para os
  botões do fim existirem na árvore.
- **Reuso:** `FakeSocketService` serve para a `RaidsListScreen` depois (usa `subscribeLobby` +
  `events`) — próxima fatia fica barata.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (fakes socket/auth → pumpRaidDetail → 4 testes
→ `flutter test`).

---

## Apêndice — Contratos (referência)

```dart
// Novos (test/support/):
class FakeSocketService implements SocketService { /* events -> Stream.empty(); resto no-op */ }
class FakeAuthNotifier extends AuthNotifier { FakeAuthNotifier(Ref, AuthState initial); }
Future<void> pumpRaidDetail(WidgetTester, { required Raid raid, required int authUserId, required String authRole });

// Reusa: FakeRaidsRepository (getResult), o padrão de ProviderScope overrides + GoRouter.
// Zero mudança de produção (a RaidDetailScreen não muda).
```
