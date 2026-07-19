# Internacionalização do HoloRaid — Design

**Data:** 2026-07-19
**Branch de trabalho:** a criar (`feat/i18n`)
**Status:** aprovado, pronto para plano de implementação

## Objetivo

Tornar o inglês a língua-base de toda a stack e dar ao app Flutter suporte a 5
idiomas: **inglês (`en`, padrão/fallback)**, **português (`pt`)**, **alemão
(`de`)**, **francês (`fr`)** e **espanhol (`es`)**. Todas as telas do app devem
ficar traduzidas. O backend é normalizado para inglês (sem framework de i18n).

## Escopo

**Dentro do escopo:**
- App Flutter: i18n completo das 13 telas + widgets de navegação/home.
- Detecção automática do locale do dispositivo no primeiro boot (fallback `en`).
- Seletor de idioma manual com persistência da escolha.
- Backend: substituir todas as mensagens PT voltadas ao usuário por inglês.

**Fora do escopo:**
- i18n do backend (framework de tradução no servidor).
- Tradução de conteúdo dinâmico vindo do banco (nomes de raids, personagens etc.).
- Idiomas RTL, formatação de datas/números por locale além do padrão do Flutter.

## Estado atual (levantado)

- App Flutter: 13 telas, ~55 arquivos Dart, ~3500 linhas. **Nenhum framework de
  i18n.** Strings hardcoded numa mistura de PT e EN (ex.: `'Hoje'`, `'Nenhuma
  raid ainda.'` convivendo com `'Continue with Discord'`, `'Terms'`).
- ~120 strings de UI (a tela de detalhe de raid concentra ~31).
- `main.dart` usa `MaterialApp.router` com Riverpod (`routerProvider`) e um
  `HoloBackground` global via `builder`.
- Backend: ~30–40 mensagens PT voltadas ao usuário (erros/validações) em
  `common/errors`, `common/middleware`, `common/security`, `discord` e
  `modules/**`.

## Decisões técnicas

- **Framework de i18n do app:** `easy_localization`. Traz embutido: detecção do
  locale do dispositivo, `fallbackLocale`, persistência da escolha
  (`saveLocale: true`) e troca em runtime via `context.setLocale(...)`.
  Traduções em JSON simples, fáceis de revisar por humanos.
- **Backend:** sem framework. Apenas substituir os textos PT por inglês.

## Arquitetura (App Flutter)

### 1. Bootstrap
- `main()` chama `WidgetsFlutterBinding.ensureInitialized()` e
  `EasyLocalization.ensureInitialized()` antes de `runApp`.
- `EasyLocalization` envolve o `ProviderScope`/`HoloRaidApp` com:
  - `supportedLocales`: `[en, pt, de, fr, es]`
  - `path`: `assets/translations`
  - `fallbackLocale`: `en`
  - `saveLocale: true` (persistência automática)
  - `useOnlyLangCode: true`
- `MaterialApp.router` recebe `locale: context.locale`,
  `supportedLocales: context.supportedLocales`,
  `localizationsDelegates: context.localizationDelegates`.

### 2. Arquivos de tradução
- Local: `app/assets/translations/{en,pt,de,fr,es}.json`.
- Declarados em `pubspec.yaml` como asset (`assets/translations/`).
- `en.json` é a **fonte canônica**, escrita à mão a partir das strings reais.
- Os outros quatro traduzidos a partir do `en.json`, com **todas as chaves
  presentes** (paridade total — nada de fallback silencioso). `pt.json`
  reaproveita as strings PT que já existem no código.

### 3. Organização das chaves
JSON aninhado por área, refletindo as telas:

```
login.*          nav.*             dashboard.*       raids.*
raid_detail.*    raid_form.*       characters.*      character_form.*
character_profile.*   profile.*    progression.*     admin.*
splash.*         common.*
```

- `common.*` para labels reutilizados (Save, Cancel, Delete, Close, "No data
  yet"…).
- Interpolação e plurais usam o formato do `easy_localization`
  (`'key'.tr(args: [...])`, `'key'.tr(namedArgs: {...})`, `'key'.plural(n)`)
  onde houver contagem/nome dinâmico.

### 4. Seletor de idioma
- Widget reutilizável `LanguageSelector` (novo, em `core/ui` ou
  `core/settings`): dropdown com o nome nativo de cada idioma — "English",
  "Português", "Deutsch", "Français", "Español" (sem bandeiras/emojis).
- Ao selecionar: `context.setLocale(Locale(code))` (o pacote persiste sozinho).
- Colocado em **dois lugares**:
  - Tela de **Login** (`features/login/login_screen.dart`) — discreto, útil
    para quem ainda não logou.
  - Tela de **Perfil** (`features/profile/profile_screen.dart`) — como item de
    configuração.

### 5. Migração das strings (tela a tela)
- Cada literal de UI vira `'chave'.tr()`.
- Strings hoje em PT/EN misturado são **normalizadas**: texto canônico em
  inglês no `en.json`; a versão PT vai para `pt.json`.
- **Não tocar** em: caminhos de asset, chaves de API, e keys internas de dados
  como `'today'`/`'week'`/`'month'`, `'operation'`, `'count'`, `'username'`
  (identificadores de agregação/serialização, não texto de UI).
- Telas/arquivos alvo:
  `login`, `nav_destinations`, `holo_user_menu`, `dashboard`, `raids_list`,
  `raid_detail`, `raid_form`, `characters_list`, `character_form`,
  `character_profile`, `profile`, `me_progression`, `users_admin`, `home` +
  `home/widgets/next_raid_hero`, `splash`.

## Backend → inglês (sem i18n)

- Substituir os literais PT voltados ao usuário por inglês em:
  - `common/errors/AppError.ts`
  - `common/middleware/errorHandler.ts`, `common/middleware/validate.ts`
  - `common/security/jwt.ts`
  - `discord/discordSync.ts`
  - `modules/**/*.service.ts` e `modules/**/*.schemas.ts`
- Manter **códigos/chaves de erro internos** inalterados; mudar apenas o texto
  legível.
- **Limitação consciente:** o backend fica só em inglês. Mensagens de erro
  cruas vindas da API aparecem em inglês no app mesmo quando o usuário escolhe
  outro idioma. As mensagens da própria UI do app ficam nos 5 idiomas. Aceitável
  para esta fase.

## Testes & verificação

- **Teste de paridade de chaves:** teste Dart que carrega os 5 JSONs e falha se
  houver qualquer chave faltando ou sobrando entre eles.
- Ajustar os widget tests existentes para o wrapper `EasyLocalization`
  (helper de teste que inicializa o pacote e injeta um locale conhecido).
- `flutter analyze` limpo; `flutter test` passando.
- Backend: `npm run build`/lint limpo após a substituição de strings.
- Smoke manual: trocar idioma no Login e no Perfil e confirmar que a UI reflete
  a escolha e que ela persiste após reload.

## Riscos & mitigações

- **Chave faltando em um idioma** → fallback silencioso para `en`. Mitigado pelo
  teste de paridade de chaves.
- **Qualidade das traduções** (de/fr/es geradas): tradução funcional inicial;
  revisão por falante nativo fica como follow-up, fora desta fase.
- **Widget tests quebrando** por falta do contexto de localização → helper de
  teste padrão que envolve os widgets com `EasyLocalization`.
- **Strings esquecidas** na migração → varredura final por literais de UI
  remanescentes antes de fechar.

## Sequência de implementação (alto nível)

1. Adicionar `easy_localization` ao `pubspec.yaml`; criar `assets/translations/`
   com os 5 JSONs; declarar asset.
2. Ligar `EasyLocalization` no `main.dart`/`MaterialApp.router`.
3. Escrever `en.json` canônico extraindo as strings reais tela a tela; migrar
   cada tela para `.tr()`.
4. Preencher `pt/de/fr/es.json` com paridade total de chaves.
5. Criar `LanguageSelector` e plugá-lo em Login e Perfil.
6. Normalizar strings do backend para inglês.
7. Teste de paridade + ajuste dos widget tests + `flutter analyze`/`test`.
8. Smoke manual e fechamento.
