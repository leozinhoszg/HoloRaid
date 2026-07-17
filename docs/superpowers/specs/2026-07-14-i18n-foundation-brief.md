# HoloRaid — i18n (Multi-idioma) — Brief para rodar em outra conversa

- **Data:** 2026-07-14
- **Tipo:** Foundation cross-cutting (não é um subsistema do roadmap; toca todo o app)
- **Status:** Brief aprovado em conceito; **ainda não brainstormado/spec'ado a fundo**.
- **Como retomar:** abra uma conversa nova e diga *"vamos fazer o i18n do HoloRaid — use o brief em `docs/superpowers/specs/2026-07-14-i18n-foundation-brief.md`"*. O fluxo é o de sempre: brainstorming → spec → plano → execução inline → branch → merge → push (commits só como Leonardo, sem Claude). Ver [[holoraid-dev-workflow]] e [[holoraid-project-state]].

## Objetivo

Tornar o app HoloRaid **multi-idioma**, com:
- **Idioma padrão: Inglês.**
- Suporte a **Português, Alemão, Espanhol, Francês** (total: 5 locales — `en`, `pt`, `de`, `es`, `fr`).
- Detecção automática pelo idioma do aparelho + **troca manual** persistida.

## Decisões já tomadas (no brainstorming do #5)

- **Comandos e embeds do Discord ficam em INGLÊS** — já resolvido na fatia #5a. Um canal
  do Discord é compartilhado por gente de vários idiomas; não dá para localizar a mensagem
  por leitor (só o timestamp `<t:...>` o Discord localiza sozinho). **Fora do escopo deste
  i18n** — não mexer no bot.
- O i18n é **cross-cutting** e **não** pertence a nenhum subsistema do roadmap; é uma
  foundation própria. Recomendação: fazer **cedo**, antes de acumular mais telas.

## Estado atual (o problema)

- Toda a UI Flutter (#1–#4) foi escrita com **strings cravadas em português**
  (ex.: "Meus Personagens", "Criar raid", "Facção", "Observações", "Sem Tier",
  "Nenhum personagem elegível", etc.). O default precisa **virar inglês**, e as strings
  precisam ser **extraídas** para arquivos de tradução.
- O backend retorna **mensagens de erro em português fixas** (ex.: no #2/#3:
  *"Seu personagem possui Tier X. Esta raid exige Tier Y ou superior."*, *"Combat Style não
  pertence à facção"*, *"Personagem de outro usuário"*). Para o app traduzir, o backend
  deve migrar de **mensagem fixa → código + parâmetros**.

## Abordagem recomendada

### Flutter (UI)
- Usar **`flutter_localizations` + `intl` com `gen-l10n`** (ARB files: `app_en.arb` base +
  `app_pt.arb`, `app_de.arb`, `app_es.arb`, `app_fr.arb`).
- `MaterialApp.router` ganha `localizationsDelegates` + `supportedLocales`; `locale`
  controlado por um provider Riverpod (`localeProvider`) que: 1) inicia pelo locale do
  dispositivo se suportado, senão `en`; 2) permite troca manual; 3) persiste a escolha
  (secure storage / shared_preferences).
- **Extrair** todas as strings das telas existentes para o ARB `en` (traduzindo PT→EN) e
  gerar as 4 traduções. Tela de **Configurações** nova com seletor de idioma.

### Backend (erros)
- Introduzir **códigos de erro** estáveis nas `AppError` (ex.: `TIER_TOO_LOW` com
  `{ tier, minimum }`, `FACTION_MISMATCH`, `NOT_OWNER`, `SLOTS_SUM_MISMATCH`, ...). O
  handler já devolve `{ error: { code, message } }` — a ideia é o `code` virar a fonte de
  verdade e o `message` só um fallback em inglês. O app mapeia `code`+params → string
  localizada.
- Migração incremental: começar pelos erros **user-facing** (validação de personagem, join
  de raid, posse). Erros internos (500) não precisam de i18n.

## Inventário de escopo (telas/arquivos a localizar)

Flutter (`app/lib/`):
- `features/login/login_screen.dart`, `features/home/home_screen.dart`
- `features/characters/`: `characters_list_screen.dart`, `character_form_screen.dart`,
  `character_profile_screen.dart`, `character_progression_screen.dart`
- `features/raids/`: `raids_list_screen.dart`, `raid_form_screen.dart`,
  `raid_detail_screen.dart`
- `core/` widgets com texto (mensagens de erro/snackbars)
- **Novo:** `features/settings/` (seletor de idioma) + `core/i18n/` (locale provider)

Backend (`backend/src/`):
- `common/errors/AppError.ts` (+ subclasses) — adicionar `code` + params estáveis.
- Revisar strings user-facing em: `modules/characters/*`, `modules/raids/*`,
  `modules/auth/*`, `common/security/guards.ts`.

## Esboço de tarefas (a refinar no plano)

1. Setup `flutter_localizations`/`gen-l10n` + `l10n.yaml` + ARB `en` vazio; app compila.
2. `localeProvider` + persistência + `MaterialApp` com delegates/supportedLocales.
3. Tela de Configurações com seletor de idioma (en/pt/de/es/fr).
4. Extrair strings tela a tela para `app_en.arb` (uma task por área: login/home, personagens,
   raids, settings) — trocando os literais por `AppLocalizations.of(context)`.
5. Gerar `app_pt/de/es/fr.arb` (traduções).
6. Backend: taxonomia de `code`s de erro user-facing + params; handler expõe `code`.
7. App: mapa `code → string localizada` (com params) para os erros; snackbars usam isso.
8. Testes: troca de locale reflete na UI; fallback para `en`; um erro conhecido aparece
   traduzido.

## Questões em aberto (resolver no brainstorming deste ciclo)

- Onde fica o seletor de idioma (Configurações? Perfil?) e se há troca sem reiniciar (sim,
  com Riverpod é hot).
- Fonte das traduções DE/ES/FR (humana vs. inicial automática a revisar).
- Até onde migrar os erros do backend agora (só user-facing vs. todos).
- Formatação de datas/números por locale (o `intl` já cobre; alinhar com o fuso do
  [[holoraid-project-state]]).

## Não fazer aqui

- Não mexer no bot/embeds do Discord (inglês, já decidido).
- Não misturar com features novas — é uma passada de foundation isolada.
