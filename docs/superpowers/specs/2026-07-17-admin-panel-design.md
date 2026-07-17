# HoloRaid — Painel Administrativo — Design

- **Data:** 2026-07-17
- **Subsistema:** Painel Administrativo (do dump de produto)
- **Depende de:** #1 (auth/role, `/users`, promote/demote), #3 (raids: transitions/delete/duplicate), 007 (FKs — torna o delete de raid seguro).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O dump lista um "Painel Administrativo": o admin pode criar/editar/excluir/cancelar/encerrar/
duplicar raids e visualizar estatísticas. Ao explorar, o achado central é que **o backend já
está todo pronto** — esta fatia é **100% Flutter**, expondo poderes que existem mas não têm UI:

- **Gestão de raid pelo admin:** o `canManage` (raids.service) já autoriza **líder OU admin**
  em editar/excluir/cancelar/encerrar/duplicar. Mas a UI só mostra os botões de gestão
  `if (iAmLeader)` (`raid_detail_screen.dart:58`) — um admin que não é o líder não vê nada. E
  **Excluir** e **Duplicar** não existem em botão nenhum (os endpoints existem).
- **Gestão de usuários:** `GET /users`, `POST /users/:id/promote`, `/demote` existem
  (admin-gated). **Zero UI** no app (grep por `/users`/`promote`/`isAdmin` deu vazio).
- **Estatísticas:** é o dashboard do #7, já feito e visível a todos.

O `raids_repository` (Flutter) já tem `remove`, `transition`, `duplicate`. O `auth.user['role']`
já está disponível. Então não há adição de backend nem de repositório de raid.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | **100% Flutter.** Nenhum endpoint, service, migration ou teste de backend novo. |
| Gestão de raid | Bloco de gestão passa a aparecer para **líder OU admin**; adicionar **Duplicar** e **Excluir** (com confirmação). |
| Gestão de usuários | Tela nova (lista + promover/rebaixar), reusando os 3 endpoints existentes. |
| Entrada | Botão **"Admin"** na home, visível **só** para admin. |
| Segurança | Gating no Flutter é **cosmético**; a defesa real é o backend (`requireAdmin`, `canManage`). Esconder botão não protege — o servidor protege. |

## Objetivos e critérios de sucesso

- Admin abre uma raid que **não criou** e vê os botões Iniciar/Encerrar/Cancelar/Duplicar/
  Excluir; usa-os com sucesso (o backend já autoriza).
- Excluir pede confirmação; ao concluir, volta para a lista (a raid sumiu).
- Admin abre a tela de usuários, vê a lista com role, e promove/rebaixa alguém; a lista
  reflete.
- **Usuário comum não vê** o botão Admin nem os botões de gestão de raid alheia.
- Nenhuma regressão: os 211 testes de backend seguem verdes **sem mudança** (nada de backend
  muda).
- `flutter analyze` limpo.

## Fora de escopo

- Qualquer mudança de backend (tudo já existe).
- Ler o `admin_audit_log` na UI (promote/demote gravam nele, mas não há endpoint de leitura —
  fatia própria se pedirem).
- Editar raid pela UI de admin (o `PATCH /raids/:id` existe, mas não há tela de edição no app
  hoje nem para o líder — fora do escopo desta fatia; o admin edita via `/edit_raid` do Discord
  ou é fatia futura).
- Gerenciar composição/roster pela UI.
- Gating server-side novo (já existe).

## Seção 1 — Gestão de raid pelo admin (`raid_detail_screen.dart`)

- Computar `iAmAdmin = auth is AuthSignedIn && auth.user['role'] == 'admin'` (já se lê
  `auth.user['id']` ali).
- Trocar `if (iAmLeader)` → `if (iAmLeader || iAmAdmin)` no bloco de ações de gestão.
- Adicionar ao bloco:
  - **Duplicar:** `raidsRepository.duplicate(id)` → snackbar + navega para a cópia (ou
    invalida a lista). Disponível em qualquer status.
  - **Excluir:** `showDialog` de confirmação → `raidsRepository.remove(id)` → `context.pop()`
    (volta para a lista) + invalida `raidsListProvider`. Seguro pós-007 (cascata limpa
    `raid_players`/`raid_discord_messages`).
- As ações existentes (start/finish/cancel) já chamam `transition`; só passam a aparecer para
  admin também.

## Seção 2 — Gestão de usuários (novo)

- **`AdminRepository`** (`features/admin/admin_repository.dart`): `listUsers()` (`GET /users`
  → lista de `{id, username, role, ...}`), `promote(id)` (`POST /users/:id/promote`),
  `demote(id)` (`POST /users/:id/demote`). Reusa `apiClientProvider`.
- **`UsersAdminScreen`** (`features/admin/users_admin_screen.dart`): `FutureBuilder` sobre
  `listUsers()`; cada item: nick + `Chip(role)` + botão **Promover** (se `role=='user'`) /
  **Rebaixar** (se `role=='admin'`). Ao agir, chama promote/demote e recarrega a lista.
  Erros (ex.: 400 "não pode se auto-rebaixar") viram snackbar.
- Rota `/admin/users` no `app_router.dart`.

## Seção 3 — Entrada no painel (`home_screen.dart`)

- Ler o role do `authStateProvider`. Se admin, mostrar um botão **"Admin"** (ícone
  `admin_panel_settings`) → `/admin/users`. Usuário comum não o vê.

## Seção 4 — Segurança & testes

**Segurança:** o gating no Flutter é conveniência de UX. A autorização real permanece no
backend: `/users` e promote/demote exigem `requireAdmin`; delete/transition/duplicate de raid
passam por `canManage` (líder/admin). Um usuário comum que forjasse a chamada seria barrado
com 403 — testado no backend (#1/#3). **Não movemos nenhuma verificação para o cliente.**

**Testes:**
- **Backend:** **nenhum novo.** Os endpoints usados já são cobertos — `users.routes.test`
  (promote/demote, 403 para não-admin), testes de raid (transitions, delete, duplicate,
  403 para não-líder/admin). Os **211 seguem verdes sem mudança**.
- **Flutter:** sem widget test (padrão do projeto). `flutter analyze` limpo.
- **Smoke manual (o que valida esta fatia):**
  1. Logar como **admin**: abrir uma raid criada por outro → ver e usar Iniciar/Encerrar/
     Cancelar/Duplicar/Excluir; Excluir confirma e volta à lista.
  2. Abrir **/admin** → lista de usuários → promover um `user` (vira admin) e rebaixar de
     volta; tentar se auto-rebaixar → snackbar de erro (400 do backend).
  3. Logar como **comum**: **não** ver o botão Admin nem os botões de gestão numa raid alheia;
     e (prova server-side) se forçar `DELETE /raids/:id` de raid alheia → 403.

## Riscos e questões em aberto

- **Verificação automatizada fraca nesta fatia.** Por ser UI-only, não há teste novo de
  backend; a confiança vem do backend já testado + `flutter analyze` + smoke manual. É uma
  consequência aceita de expor UI sobre backend pronto — registrado com honestidade.
- **Sem tela de edição de raid** (nem para líder) hoje — então "Editar raids" do dump não é
  entregue aqui; é fatia própria (precisa de um form de edição). As demais ações do dump
  (criar/excluir/cancelar/encerrar/duplicar) ficam cobertas.
- **`context.pop()` após excluir:** se o usuário chegou à raid por deep link (sem stack de
  navegação), o pop pode não ter para onde voltar — usar `context.canPop() ? pop() : go('/raids')`.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (botões de admin no raid detail → AdminRepository
+ UsersAdminScreen + rota → botão Admin na home).

---

## Apêndice — Contratos (referência)

```dart
// Novo (features/admin/admin_repository.dart):
class AdminRepository {
  Future<List<Map<String, dynamic>>> listUsers();      // GET /users
  Future<void> promote(int id);                         // POST /users/:id/promote
  Future<void> demote(int id);                          // POST /users/:id/demote
}
final adminRepositoryProvider = Provider<AdminRepository>(...);

// Alterado (raid_detail_screen.dart): iAmLeader -> (iAmLeader || iAmAdmin) no bloco de gestão,
//   + botões Duplicar (repo.duplicate) e Excluir (repo.remove, com confirmação + pop).

// Rotas novas (app_router.dart): GoRoute('/admin/users' -> UsersAdminScreen)
// Home: botão "Admin" visível só se auth.user['role'] == 'admin'.
```
