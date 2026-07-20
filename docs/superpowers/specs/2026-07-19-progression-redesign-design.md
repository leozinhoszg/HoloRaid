# Redesenho da tela de Progressão

**Data:** 2026-07-19
**Branch:** feat/i18n

## Problema

A tela de progressão (`app/lib/features/profile/me_progression_screen.dart`) lista uma
linha por boss+dificuldade agrupando só por operação. Resultado: "Zorn & Toth · Veteran"
e "Zorn & Toth · Master" viram duas linhas, o Timer aparece como "Timer · timer", e não há
seção dedicada para Lair Bosses. Preencher a progressão fica lento e confuso.

## Objetivo

Cada boss em **uma linha** com checkboxes de Veteran e Master lado a lado; seções
dedicadas de **Lair Bosses** e **Timers**.

## Escopo

Três camadas: dados (seed + migration), app (tela Flutter), i18n (5 locales).
Nenhuma mudança de endpoint/contrato — `/reference/bosses` já devolve `type`
(`boss`/`timer`/`lair`), que separa as seções.

### 1. Dados — mover secret bosses

Hateful Entity e Dreadful Entity hoje são `type='lair'` soltos (operação = nome do boss).
Passam a ser bosses **dentro** das operações:

- **Hateful Entity** → `operation='Scum and Villainy'`, `difficulty='Master'`, `type='boss'`
- **Dreadful Entity** → `operation='Terror From Beyond'`, `difficulty='Veteran'`, `type='boss'`

Como o seed roda dentro da migration `002_personagens.ts` (já aplicada nos bancos
existentes), duas ações mantêm fresh e existentes consistentes:

- Editar `backend/src/reference/bossesSeed.ts`: remover as 2 linhas `lair(...)` de Hateful/
  Dreadful e adicioná-las como entradas `type='boss'` nas operações-alvo → corrige
  instalações novas.
- Criar `backend/src/db/migrations/009_bosses_secret.ts`:
  - `up`: `UPDATE bosses SET operation='Scum and Villainy', type='boss' WHERE boss='Hateful Entity'`
    e `UPDATE bosses SET operation='Terror From Beyond', type='boss' WHERE boss='Dreadful Entity'`.
    `difficulty` fica como está. Idempotente (em fresh DB já está correto → no-op).
  - `down`: reverte para `operation` = nome do boss, `type='lair'`.

Sobra na seção Lair Bosses exatamente 6: XR-53, Xeno, Golden Fury, Hive Queen (="Queen"),
Monolith, Eyeless.

### 2. App — `me_progression_screen.dart`

No `_load`, transformar o catálogo em 3 grupos:

- **Operações** (`type='boss'`): agrupa por operação (ordem de primeira aparição); dentro,
  agrupa por boss num `_BossRow { nome, vetId?, masterId? }`.
- **Lair Bosses** (`type='lair'`): seção única, mesmo formato de linha.
- **Timers** (`type='timer'`): seção única, um checkbox por operação.

Renderização (Card + ExpansionTile por seção, título Orbitron como hoje):

```
▼ Explosive Conflict
   Zorn & Toth          Veteran ☑   Master ☑
   ...
   Hateful Entity                   Master ☑     ← só a coluna existente
▼ Lair Bosses
   XR-53                Veteran ☑   Master ☑
   Xeno                 Veteran ☑
▼ Timers
   Explosive Conflict               Timed ☑
```

- `_diffCheck(label, bossId)`: widget tappável (Checkbox + label) que dá toggle no
  `_checked` (Set<int> de ids). Só a(s) coluna(s) que existe(m) aparece(m) — sem placeholder
  de dificuldade ausente.
- Save inalterado: `PUT /me/bosses` com `_checked.toList()`, botão Salvar, invalidação de
  `meProvider` e `charactersProvider`.
- Secret bosses aparecem no fim da lista da operação, sem destaque visual especial.

### 3. i18n

Adicionar em `de/en/es/pt/fr.json` sob `progression`: `lair_bosses`, `timers`, `timed`.
Veteran/Master ficam literais (termo de jogo, como hoje). "Lair Bosses", "Timers" e "Timed"
ficam como jargão do SWTOR (não traduzidos) em todos os locales, por consistência.

## Fora de escopo

- Alterar pontuação (points) ou regras de Tier.
- Tocar no backend além do seed/migration acima.
- Migrar outras telas para i18n.
