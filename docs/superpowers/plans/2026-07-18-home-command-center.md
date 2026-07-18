# Home Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaginar a Home num command center holográfico e estabelecer a base visual global do app (tema dark + camada `core/ui` + tipografia), mobile-first para Android/iOS/web.

**Architecture:** Tema dark global + widgets compartilhados em `core/ui` (extraídos do login). Home consome endpoints existentes (`/me`, `/me/raids`, `/characters`) via Riverpod, deriva a próxima raid e contadores. Layout por constraints (`LayoutBuilder`, `Expanded`, `Wrap`) — sem largura fixa. Visual = gradientes + starfield (CustomPainter) + glow + `flutter_animate`; fragment shader é enhancement opcional no fim.

**Tech Stack:** Flutter, Riverpod, go_router, flutter_animate, CustomPainter, ShaderMask, Dio.

## Global Constraints

- **Fontes:** Audiowide (wordmark) · Orbitron (títulos/números) · Aldrich (labels uppercase) · Jura (texto). Arquivos `.ttf` de `backend/src/assets/fonts` copiados p/ `app/assets/fonts/`.
- **Paleta (`HoloPalette`):** bg `#080816`/`#0B0F28`/`#050509`; blue `#76C8FF`, indigo/tank `#7E7BFF`, heal `#8CFFB7`, gold `#FFF29A`, dps `#FF8B5B`, red `#FF5555`; ink `#EAECF7`, dim `#9AA0C3`, faint `#6B7099`; glass `rgba(14,18,40,.55)`; discord `#5865F2`.
- **Movimento:** 150/200/250ms, easeOut/easeInOut. Dark-only. Sem Three.js/WebGL externo.
- **Responsivo:** breakpoint `compact = maxWidth < 720`. Nada de overflow horizontal; tudo dentro de `SafeArea` + `SingleChildScrollView`.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`, **sem** `Co-Authored-By`.
- **Rodar Flutter pelo PowerShell** (não git-bash). Backend em `:3010` → build/run com `--dart-define=API_BASE_URL=http://localhost:3010`.
- Gate por tarefa: `flutter analyze` limpo + `flutter test` verde.

## File Structure

- Create `app/assets/fonts/*.ttf` — as 4 famílias (pesos necessários).
- Create `app/lib/core/ui/holo_palette.dart` — paleta única (absorve `LoginPalette`).
- Create `app/lib/core/ui/holo_theme.dart` — `ThemeData` dark global + `holoTextTheme`.
- Create `app/lib/core/ui/holo_wordmark.dart` — wordmark Audiowide (gradiente+glow).
- Create `app/lib/core/ui/holo_background.dart` — fundo (gradiente+starfield+glow, respeita reduzir-animações).
- Move `app/lib/features/login/widgets/starfield.dart` → `app/lib/core/ui/starfield.dart`.
- Move `app/lib/features/login/widgets/glass_card.dart` → `app/lib/core/ui/glass_card.dart`.
- Create `app/lib/core/settings/settings_providers.dart` — `reduceMotionProvider`.
- Create `app/lib/features/home/my_raid_model.dart` — model `MyRaid` + derivação.
- Create `app/lib/features/home/home_providers.dart` — `meProvider`, `myRaidsProvider`.
- Create `app/lib/features/home/widgets/home_top_bar.dart`, `next_raid_hero.dart`, `stat_tiles.dart`, `nav_grid.dart`, `home_skeleton.dart`.
- Modify `app/lib/features/home/home_screen.dart` — reescrita (composição responsiva).
- Modify `app/lib/main.dart` — aplica `holoTheme`.
- Modify `app/lib/features/login/login_screen.dart`, `login_theme.dart` — imports p/ `core/ui` (visual inalterado).
- Modify `app/pubspec.yaml` — `fonts:`, `assets: assets/fonts/`.
- Tests: `app/test/features/home/*` e `app/test/core/ui/holo_wordmark_test.dart`.

---

### Task 1: Fontes + tema dark global

**Files:**
- Create: `app/assets/fonts/{Audiowide-Regular,Aldrich-Regular,Orbitron-Medium,Orbitron-SemiBold,Orbitron-Bold,Orbitron-Black,Jura-Regular,Jura-Medium,Jura-SemiBold}.ttf`
- Create: `app/lib/core/ui/holo_palette.dart`, `app/lib/core/ui/holo_theme.dart`
- Modify: `app/pubspec.yaml`, `app/lib/main.dart`
- Test: `app/test/widget_test.dart` (ajuste)

**Interfaces:**
- Produces: `HoloPalette` (classe com `static const Color`), `holoTheme()` → `ThemeData`.

- [ ] **Step 1: Copiar as fontes** (PowerShell):
```powershell
$src="d:\HoloRaid\backend\src\assets\fonts"; $dst="d:\HoloRaid\app\assets\fonts"; New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$src\Audiowide\Audiowide-Regular.ttf" $dst
Copy-Item "$src\Aldrich\Aldrich-Regular.ttf" $dst
Copy-Item "$src\Orbitron\static\Orbitron-Medium.ttf","$src\Orbitron\static\Orbitron-SemiBold.ttf","$src\Orbitron\static\Orbitron-Bold.ttf","$src\Orbitron\static\Orbitron-Black.ttf" $dst
Copy-Item "$src\Jura\static\Jura-Regular.ttf","$src\Jura\static\Jura-Medium.ttf","$src\Jura\static\Jura-SemiBold.ttf" $dst
```

- [ ] **Step 2: `holo_palette.dart`**:
```dart
import 'package:flutter/material.dart';

class HoloPalette {
  static const bgTop = Color(0xFF080816);
  static const bgMid = Color(0xFF0B0F28);
  static const bgBottom = Color(0xFF050509);
  static const blue = Color(0xFF76C8FF);
  static const indigo = Color(0xFF7E7BFF);
  static const tank = Color(0xFF7E7BFF);
  static const heal = Color(0xFF8CFFB7);
  static const gold = Color(0xFFFFF29A);
  static const dps = Color(0xFFFF8B5B);
  static const red = Color(0xFFFF5555);
  static const ink = Color(0xFFEAECF7);
  static const dim = Color(0xFF9AA0C3);
  static const faint = Color(0xFF6B7099);
  static const glassFill = Color(0x8C0E1228); // rgba(14,18,40,.55)
  static const glassBorder = Color(0x247C8CFF); // rgba(120,140,255,.14)
  static const glassBorderStrong = Color(0x477C8CFF); // .28
  static const discord = Color(0xFF5865F2);

  /// Gradiente do wordmark (6 tons, stops 0/.22/.48/.72/.88/1).
  static const wordmark = [blue, indigo, heal, gold, dps, red];
  static const wordmarkStops = [0.0, 0.22, 0.48, 0.72, 0.88, 1.0];
}
```

- [ ] **Step 3: `holo_theme.dart`**:
```dart
import 'package:flutter/material.dart';
import 'holo_palette.dart';

ThemeData holoTheme() {
  final scheme = const ColorScheme.dark(
    primary: HoloPalette.indigo,
    secondary: HoloPalette.blue,
    surface: HoloPalette.bgMid,
    error: HoloPalette.red,
    onPrimary: Color(0xFF0A0D1C),
    onSurface: HoloPalette.ink,
  );
  const label = TextStyle(fontFamily: 'Aldrich', letterSpacing: 2, color: HoloPalette.dim);
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: HoloPalette.bgMid,
    fontFamily: 'Jura',
    textTheme: const TextTheme(
      displaySmall: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.ink),
      headlineSmall: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.ink),
      titleLarge: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w600, color: HoloPalette.ink),
      titleMedium: TextStyle(fontFamily: 'Aldrich', color: HoloPalette.ink),
      labelLarge: label, labelMedium: label, labelSmall: label,
      bodyMedium: TextStyle(fontFamily: 'Jura', color: HoloPalette.ink),
      bodySmall: TextStyle(fontFamily: 'Jura', color: HoloPalette.dim),
    ),
    iconTheme: const IconThemeData(color: HoloPalette.dim),
  );
}
```

- [ ] **Step 4: `pubspec.yaml`** — sob `flutter:` adicionar assets e fonts:
```yaml
  assets:
    - assets/
    - assets/fonts/
  fonts:
    - family: Audiowide
      fonts: [{ asset: assets/fonts/Audiowide-Regular.ttf }]
    - family: Aldrich
      fonts: [{ asset: assets/fonts/Aldrich-Regular.ttf }]
    - family: Orbitron
      fonts:
        - { asset: assets/fonts/Orbitron-Medium.ttf, weight: 500 }
        - { asset: assets/fonts/Orbitron-SemiBold.ttf, weight: 600 }
        - { asset: assets/fonts/Orbitron-Bold.ttf, weight: 700 }
        - { asset: assets/fonts/Orbitron-Black.ttf, weight: 900 }
    - family: Jura
      fonts:
        - { asset: assets/fonts/Jura-Regular.ttf, weight: 400 }
        - { asset: assets/fonts/Jura-Medium.ttf, weight: 500 }
        - { asset: assets/fonts/Jura-SemiBold.ttf, weight: 600 }
```

- [ ] **Step 5: `main.dart`** — trocar o theme:
```dart
import 'core/ui/holo_theme.dart';
// ...
return MaterialApp.router(
  title: 'HoloRaid',
  theme: holoTheme(),
  routerConfig: router,
);
```

- [ ] **Step 6: Rodar** `flutter pub get` e `flutter analyze` → limpo. Ajustar `widget_test.dart` se assertar tema claro (trocar p/ `Brightness.dark`). `flutter test` verde.

- [ ] **Step 7: Commit**
```bash
git add app/assets/fonts app/lib/core/ui/holo_palette.dart app/lib/core/ui/holo_theme.dart app/pubspec.yaml app/pubspec.lock app/lib/main.dart app/test/widget_test.dart
git commit -m "feat(app): tema dark holografico global + 4 fontes"
```

---

### Task 2: Camada `core/ui` — mover Starfield/GlassCard, criar HoloWordmark

**Files:**
- Move: `starfield.dart`, `glass_card.dart` p/ `app/lib/core/ui/`
- Create: `app/lib/core/ui/holo_wordmark.dart`
- Modify: `login_screen.dart` (imports)
- Test: `app/test/core/ui/holo_wordmark_test.dart`

**Interfaces:**
- Consumes: `HoloPalette`.
- Produces: `Starfield`, `GlassCard`, `HoloWordmark({double size})`.

- [ ] **Step 1: Mover arquivos** e ajustar imports em `login_screen.dart` (de `widgets/starfield.dart`/`widgets/glass_card.dart` para `../../core/ui/...`). `Starfield`/`GlassCard` passam a importar `../ui/holo_palette.dart` (ou `HoloPalette`), mantendo o mesmo visual.

- [ ] **Step 2: Teste falho `holo_wordmark_test.dart`**:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/ui/holo_wordmark.dart';

void main() {
  testWidgets('HoloWordmark renderiza o texto HoloRaid', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: HoloWordmark(size: 34))));
    expect(find.text('HoloRaid'), findsOneWidget);
  });
}
```

- [ ] **Step 3: Rodar** → FAIL (arquivo não existe).

- [ ] **Step 4: `holo_wordmark.dart`**:
```dart
import 'package:flutter/material.dart';
import 'holo_palette.dart';

class HoloWordmark extends StatelessWidget {
  const HoloWordmark({super.key, this.size = 34});
  final double size;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (r) => const LinearGradient(
        colors: HoloPalette.wordmark, stops: HoloPalette.wordmarkStops,
      ).createShader(r),
      child: Text(
        'HoloRaid',
        style: TextStyle(
          fontFamily: 'Audiowide', fontSize: size, letterSpacing: .5, height: 1,
          color: Colors.white,
          shadows: const [
            Shadow(color: Color(0x734AB4FF), blurRadius: 20),
            Shadow(color: Color(0x59FF6464), blurRadius: 22),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Rodar** `flutter test` → PASS. `flutter analyze` limpo. Rodar o teste existente do login (deve continuar verde com os imports novos).

- [ ] **Step 6: Commit**
```bash
git add app/lib/core/ui app/lib/features/login app/test/core/ui/holo_wordmark_test.dart
git commit -m "feat(app): camada core/ui compartilhada (Starfield, GlassCard, HoloWordmark)"
```

---

### Task 3: `HoloBackground` + reduzir-animações

**Files:**
- Create: `app/lib/core/ui/holo_background.dart`, `app/lib/core/settings/settings_providers.dart`
- Test: `app/test/core/ui/holo_background_test.dart`

**Interfaces:**
- Consumes: `Starfield`, `HoloPalette`, `reduceMotionProvider`.
- Produces: `HoloBackground({required Widget child})`; `reduceMotionProvider` (`StateProvider<bool>`).

- [ ] **Step 1: `settings_providers.dart`**:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
/// Quando true: sem starfield, sem animações contínuas, durações reduzidas.
final reduceMotionProvider = StateProvider<bool>((ref) => false);
```

- [ ] **Step 2: Teste falho `holo_background_test.dart`**:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/ui/holo_background.dart';

void main() {
  testWidgets('HoloBackground pinta o filho', (tester) async {
    await tester.pumpWidget(const ProviderScope(
      child: MaterialApp(home: HoloBackground(child: Text('x', textDirection: TextDirection.ltr)))));
    expect(find.text('x'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
  });
}
```

- [ ] **Step 3: Rodar** → FAIL.

- [ ] **Step 4: `holo_background.dart`** (gradiente base + glow radiais + starfield condicional):
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../settings/settings_providers.dart';
import 'holo_palette.dart';
import 'starfield.dart';

class HoloBackground extends ConsumerWidget {
  const HoloBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reduce = ref.watch(reduceMotionProvider) || MediaQuery.of(context).disableAnimations;
    return Stack(fit: StackFit.expand, children: [
      const DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(
        center: Alignment(0, -1), radius: 1.3,
        colors: [HoloPalette.bgMid, HoloPalette.bgTop, HoloPalette.bgBottom], stops: [0, .45, 1]))),
      if (!reduce) const Starfield(),
      const DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(
        center: Alignment(-.7, -.8), radius: 1.1,
        colors: [Color(0x1A76C8FF), Color(0x0076C8FF)]))),
      const DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(
        center: Alignment(.9, 1.2), radius: 1.2,
        colors: [Color(0x1F7E7BFF), Color(0x007E7BFF)]))),
      child,
    ]);
  }
}
```

- [ ] **Step 5: Rodar** → PASS. `flutter analyze` limpo.

- [ ] **Step 6: Commit**
```bash
git add app/lib/core/ui/holo_background.dart app/lib/core/settings/settings_providers.dart app/test/core/ui/holo_background_test.dart
git commit -m "feat(app): HoloBackground + provider de reduzir-animacoes"
```

---

### Task 4: Dados — `MyRaid` model, derivação e providers

**Files:**
- Create: `app/lib/features/home/my_raid_model.dart`, `app/lib/features/home/home_providers.dart`
- Test: `app/test/features/home/my_raid_model_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`, `authServiceProvider`, `charactersProvider`.
- Produces: `MyRaid` (campos abaixo); `MyRaid.fromJson`; `nextRaid(List<MyRaid>, DateTime now)`; `activeRaidsCount(...)`, `confirmedCount(...)`; `meProvider`, `myRaidsProvider`.

- [ ] **Step 1: Teste falho `my_raid_model_test.dart`**:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/features/home/my_raid_model.dart';

MyRaid _r(int id, String startIso, String status, {String? my}) => MyRaid.fromJson({
  'id': id, 'codigo': 'R$id', 'operation': 'Op$id', 'difficulty': 'veteran',
  'size': 8, 'faction': 'empire', 'start_at': startIso, 'status': status,
  'created': 0, 'my_status': my,
});

void main() {
  final now = DateTime.parse('2026-07-18T20:00:00Z');
  test('nextRaid pega a futura mais proxima OPEN/RUNNING', () {
    final list = [
      _r(1, '2026-07-17T20:00:00Z', 'FINISHED'),
      _r(2, '2026-07-19T20:00:00Z', 'OPEN'),
      _r(3, '2026-07-18T22:00:00Z', 'OPEN'),
      _r(4, '2026-07-18T21:00:00Z', 'CANCELLED'),
    ];
    expect(nextRaid(list, now)!.id, 3);
  });
  test('nextRaid null quando nao ha futura ativa', () {
    expect(nextRaid([_r(1, '2026-07-10T20:00:00Z', 'FINISHED')], now), isNull);
  });
  test('contadores', () {
    final list = [_r(2, '2026-07-19T20:00:00Z', 'OPEN', my: 'confirmed'),
                  _r(3, '2026-07-18T22:00:00Z', 'RUNNING', my: 'waitlist')];
    expect(activeRaidsCount(list), 2);
    expect(confirmedCount(list), 1);
  });
}
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: `my_raid_model.dart`**:
```dart
class MyRaid {
  final int id; final String codigo, operation, difficulty, faction, status;
  final int size; final DateTime startAt; final bool created; final String? myStatus;
  MyRaid({required this.id, required this.codigo, required this.operation, required this.difficulty,
    required this.faction, required this.status, required this.size, required this.startAt,
    required this.created, required this.myStatus});

  factory MyRaid.fromJson(Map<String, dynamic> j) => MyRaid(
    id: j['id'] as int, codigo: j['codigo'] as String? ?? '', operation: j['operation'] as String? ?? '',
    difficulty: j['difficulty'] as String? ?? '', faction: j['faction'] as String? ?? '',
    status: j['status'] as String? ?? '', size: (j['size'] as num?)?.toInt() ?? 0,
    startAt: DateTime.parse(j['start_at'] as String).toLocal(),
    created: (j['created'] as num?)?.toInt() == 1 || j['created'] == true,
    myStatus: j['my_status'] as String?);

  bool get isActive => status == 'OPEN' || status == 'RUNNING';
}

MyRaid? nextRaid(List<MyRaid> list, DateTime now) {
  final future = list.where((r) => r.isActive && r.startAt.isAfter(now)).toList()
    ..sort((a, b) => a.startAt.compareTo(b.startAt));
  return future.isEmpty ? null : future.first;
}

int activeRaidsCount(List<MyRaid> list) => list.where((r) => r.isActive).length;
int confirmedCount(List<MyRaid> list) => list.where((r) => r.myStatus == 'confirmed').length;
```

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: `home_providers.dart`**:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import 'my_raid_model.dart';

final meProvider = FutureProvider<Map<String, dynamic>>(
    (ref) => ref.read(authServiceProvider).loadMe());

final myRaidsProvider = FutureProvider<List<MyRaid>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/me/raids');
  return (res.data as List).map((e) => MyRaid.fromJson((e as Map).cast<String, dynamic>())).toList();
});
```

- [ ] **Step 6: `flutter analyze` limpo. Commit**
```bash
git add app/lib/features/home/my_raid_model.dart app/lib/features/home/home_providers.dart app/test/features/home/my_raid_model_test.dart
git commit -m "feat(app): modelo MyRaid + providers de dados da Home"
```

---

### Task 5: Widgets da TopBar, StatTiles e NavGrid (responsivos)

**Files:**
- Create: `home_top_bar.dart`, `stat_tiles.dart`, `nav_grid.dart` (em `features/home/widgets/`)
- Test: `app/test/features/home/nav_grid_test.dart`

**Interfaces:**
- Consumes: `HoloWordmark`, `GlassCard`, `HoloPalette`, `AppConfig`.
- Produces:
  - `HomeTopBar({required Map<String,dynamic> me, required bool compact, required VoidCallback onLogout})`
  - `StatTiles({required int raids, required int chars, required int confirmed, required bool compact})`
  - `NavItem(color,label,desc,icon,route,admin)`, `NavGrid({required bool isAdmin, required bool compact})`

- [ ] **Step 1: `home_top_bar.dart`** — wordmark + chip (avatar Discord com fallback, papel oculto no compact) + logout. Usa `Expanded`/`Flexible` p/ não estourar:
```dart
import 'package:flutter/material.dart';
import '../../../core/config/app_config.dart';
import '../../../core/ui/holo_palette.dart';
import '../../../core/ui/holo_wordmark.dart';

class HomeTopBar extends StatelessWidget {
  const HomeTopBar({super.key, required this.me, required this.compact, required this.onLogout});
  final Map<String, dynamic> me; final bool compact; final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final name = me['username'] as String? ?? '—';
    final role = (me['role'] as String? ?? 'user').toUpperCase();
    final discordId = me['discord_id']?.toString();
    final avatar = me['avatar'] as String?;
    final url = (discordId != null && avatar != null)
        ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png' : null;
    return Row(children: [
      HoloWordmark(size: compact ? 26 : 34),
      const Spacer(),
      Flexible(child: Container(
        padding: const EdgeInsets.fromLTRB(6, 6, 12, 6),
        decoration: BoxDecoration(color: HoloPalette.glassFill,
          border: Border.all(color: HoloPalette.glassBorderStrong), borderRadius: BorderRadius.circular(40)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          _Avatar(url: url, name: name, size: compact ? 34 : 40),
          const SizedBox(width: 9),
          Flexible(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontFamily: 'Aldrich', fontSize: compact ? 12 : 14, color: HoloPalette.ink)),
            if (!compact) Text('OPERATIVE · $role',
              style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 2, color: HoloPalette.indigo)),
          ])),
          const SizedBox(width: 6),
          IconButton(onPressed: onLogout, iconSize: 18, color: HoloPalette.dim,
            icon: const Icon(Icons.logout), tooltip: 'Sair'),
        ]),
      )),
    ]);
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.url, required this.name, required this.size});
  final String? url, name; final double size;
  @override
  Widget build(BuildContext context) {
    final initial = (name ?? '?').isEmpty ? '?' : name!.replaceAll('.', '').characters.firstOrNull?.toUpperCase() ?? '?';
    return Container(
      width: size, height: size, padding: const EdgeInsets.all(2),
      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: SweepGradient(
        colors: [HoloPalette.blue, HoloPalette.indigo, HoloPalette.heal, HoloPalette.dps, HoloPalette.red, HoloPalette.blue])),
      child: ClipOval(child: Container(color: const Color(0xFF0D1024), alignment: Alignment.center,
        child: url == null
          ? Text(initial, style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.blue))
          : Image.network(url, fit: BoxFit.cover, width: size, height: size,
              errorBuilder: (_, _, _) => Text(initial, style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.blue))))),
    );
  }
}
```

- [ ] **Step 2: `stat_tiles.dart`** — 3 tiles; wide `Row(Expanded)`, compact `Column`:
```dart
import 'package:flutter/material.dart';
import '../../../core/ui/glass_card.dart';
import '../../../core/ui/holo_palette.dart';

class StatTiles extends StatelessWidget {
  const StatTiles({super.key, required this.raids, required this.chars, required this.confirmed, required this.compact});
  final int raids, chars, confirmed; final bool compact;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      _tile('RAIDS ATIVAS', '$raids', HoloPalette.blue),
      _tile('PERSONAGENS', '$chars', HoloPalette.heal),
      _tile('CONFIRMAÇÕES', '$confirmed', HoloPalette.dps),
    ];
    if (compact) {
      return Column(children: [
        for (var i = 0; i < tiles.length; i++) ...[if (i > 0) const SizedBox(height: 12), tiles[i]],
      ]);
    }
    return Row(children: [
      for (var i = 0; i < tiles.length; i++) ...[if (i > 0) const SizedBox(width: 14), Expanded(child: tiles[i])],
    ]);
  }

  Widget _tile(String k, String v, Color c) => GlassCard(
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(k, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.faint)),
      const SizedBox(height: 10),
      Text(v, style: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 30, color: c)),
    ]),
  );
}
```

- [ ] **Step 3: Teste falho `nav_grid_test.dart`**:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/home/widgets/nav_grid.dart';

Widget _wrap(Widget c) => MaterialApp.router(routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => Scaffold(body: c))]));

void main() {
  testWidgets('NavGrid esconde Admin para user', (tester) async {
    await tester.pumpWidget(_wrap(const NavGrid(isAdmin: false, compact: true)));
    expect(find.text('Personagens'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });
  testWidgets('NavGrid mostra Admin para admin', (tester) async {
    await tester.pumpWidget(_wrap(const NavGrid(isAdmin: true, compact: true)));
    expect(find.text('Admin'), findsOneWidget);
  });
}
```

- [ ] **Step 4: Rodar** → FAIL.

- [ ] **Step 5: `nav_grid.dart`** — `Wrap` responsivo (largura de tile por breakpoint, sem overflow):
```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/ui/glass_card.dart';
import '../../../core/ui/holo_palette.dart';

class NavGrid extends StatelessWidget {
  const NavGrid({super.key, required this.isAdmin, required this.compact});
  final bool isAdmin, compact;

  @override
  Widget build(BuildContext context) {
    final items = <_Item>[
      const _Item(HoloPalette.indigo, 'Personagens', 'gestão do roster', Icons.people_alt_outlined, '/characters'),
      const _Item(HoloPalette.blue, 'Raids', 'organizar operations', Icons.calendar_month_outlined, '/raids'),
      const _Item(HoloPalette.heal, 'Dashboard', 'progressão PvE', Icons.bar_chart, '/dashboard'),
      const _Item(HoloPalette.gold, 'Perfil', 'sua conta', Icons.person_outline, '/profile'),
      if (isAdmin) const _Item(HoloPalette.red, 'Admin', 'usuários & papéis', Icons.shield_outlined, '/admin/users'),
    ];
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth < 380 ? 1 : (c.maxWidth < 720 ? 2 : 5);
      final gap = 14.0;
      final w = (c.maxWidth - gap * (cols - 1)) / cols;
      return Wrap(spacing: gap, runSpacing: gap,
        children: items.map((it) => SizedBox(width: w, child: _Tile(it: it, compact: compact))).toList());
    });
  }
}

class _Item {
  final Color color; final String label, desc; final IconData icon; final String route;
  const _Item(this.color, this.label, this.desc, this.icon, this.route);
}

class _Tile extends StatelessWidget {
  const _Tile({required this.it, required this.compact});
  final _Item it; final bool compact;
  @override
  Widget build(BuildContext context) {
    return InkWell(borderRadius: BorderRadius.circular(16), onTap: () => context.push(it.route),
      child: GlassCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 40, height: 40, alignment: Alignment.center,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(11),
            border: Border.all(color: HoloPalette.glassBorderStrong)),
          child: Icon(it.icon, color: it.color, size: 20)),
        const SizedBox(height: 14),
        Text(it.label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 13, letterSpacing: 1, color: HoloPalette.ink)),
        if (!compact) ...[const SizedBox(height: 4),
          Text(it.desc, style: const TextStyle(fontFamily: 'Jura', fontSize: 11, color: HoloPalette.faint))],
      ])),
    );
  }
}
```

- [ ] **Step 6: Rodar** `flutter test` → PASS. `flutter analyze` limpo.

- [ ] **Step 7: Commit**
```bash
git add app/lib/features/home/widgets/home_top_bar.dart app/lib/features/home/widgets/stat_tiles.dart app/lib/features/home/widgets/nav_grid.dart app/test/features/home/nav_grid_test.dart
git commit -m "feat(app): widgets TopBar, StatTiles e NavGrid responsivos"
```

---

### Task 6: `NextRaidHero` (countdown ao vivo + empty-state)

**Files:**
- Create: `app/lib/features/home/widgets/next_raid_hero.dart`
- Test: `app/test/features/home/next_raid_hero_test.dart`

**Interfaces:**
- Consumes: `MyRaid`, `GlassCard`, `HoloPalette`.
- Produces: `NextRaidHero({MyRaid? raid, required bool compact})`.

- [ ] **Step 1: Teste falho `next_raid_hero_test.dart`**:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/home/my_raid_model.dart';
import 'package:holoraid/features/home/widgets/next_raid_hero.dart';

Widget _wrap(Widget c) => MaterialApp.router(routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => Scaffold(body: SingleChildScrollView(child: c)))]));

void main() {
  testWidgets('com raid mostra operation', (tester) async {
    final r = MyRaid.fromJson({'id': 1, 'codigo': 'DF1', 'operation': 'The Dread Fortress',
      'difficulty': 'veteran', 'size': 8, 'faction': 'empire',
      'start_at': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      'status': 'OPEN', 'created': 0, 'my_status': 'confirmed'});
    await tester.pumpWidget(_wrap(NextRaidHero(raid: r, compact: true)));
    expect(find.text('The Dread Fortress'), findsOneWidget);
  });
  testWidgets('sem raid mostra empty-state', (tester) async {
    await tester.pumpWidget(_wrap(const NextRaidHero(raid: null, compact: true)));
    expect(find.textContaining('Nenhuma operation'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: `next_raid_hero.dart`** — card com faixa lateral, chips (`Wrap`), countdown (`Timer.periodic`), slots; layout `compact` em coluna única; empty-state com CTA `/raids`. Título `maxLines: 2` + ellipsis; CTA `double.infinity`.
```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/ui/holo_palette.dart';
import '../my_raid_model.dart';

class NextRaidHero extends StatelessWidget {
  const NextRaidHero({super.key, required this.raid, required this.compact});
  final MyRaid? raid; final bool compact;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(borderRadius: BorderRadius.circular(22), child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xB8141A36), Color(0x990A0D1E)]),
        border: Border.all(color: HoloPalette.glassBorderStrong), borderRadius: BorderRadius.circular(22)),
      child: raid == null ? _empty(context) : _content(context, raid!),
    ));
  }

  Widget _empty(BuildContext context) => Padding(padding: const EdgeInsets.all(28),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('SEM OPERATION AGENDADA', style: TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.faint)),
      const SizedBox(height: 12),
      Text('Nenhuma operation na sua agenda', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text('Crie uma raid ou entre em uma para vê-la aqui.', style: TextStyle(fontFamily: 'Jura', color: HoloPalette.dim)),
      const SizedBox(height: 20),
      _CtaButton(label: 'VER RAIDS', onTap: () => context.push('/raids')),
    ]));

  Widget _content(BuildContext context, MyRaid r) {
    final left = _Details(raid: r);
    final right = _Countdown(raid: r);
    final body = compact
      ? Column(children: [left, const Divider(height: 1, color: HoloPalette.glassBorder), right])
      : IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(flex: 3, child: left),
          const VerticalDivider(width: 1, color: HoloPalette.glassBorder),
          Expanded(flex: 2, child: right)]));
    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(width: 4, decoration: const BoxDecoration(gradient: LinearGradient(
        begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [HoloPalette.blue, HoloPalette.indigo, HoloPalette.dps]))),
      Expanded(child: body),
    ]);
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.raid});
  final MyRaid raid;
  @override
  Widget build(BuildContext context) {
    return Padding(padding: const EdgeInsets.all(24), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      const Row(children: [
        _Pulse(), SizedBox(width: 7),
        Text('PRÓXIMA OPERATION', style: TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.heal))]),
      const SizedBox(height: 14),
      Text(raid.operation, maxLines: 2, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 26, color: HoloPalette.ink)),
      const SizedBox(height: 6),
      Text('RAID #${raid.codigo}', style: const TextStyle(fontFamily: 'Jura', fontSize: 13, color: HoloPalette.faint)),
      const SizedBox(height: 16),
      Wrap(spacing: 8, runSpacing: 8, children: [
        _chip(raid.difficulty.toUpperCase(), on: true),
        _chip('${raid.size}-MAN'), _chip(raid.faction.toUpperCase())]),
      if (raid.myStatus != null) ...[const SizedBox(height: 16),
        Row(children: [
          Container(width: 9, height: 9, decoration: const BoxDecoration(color: HoloPalette.dps, borderRadius: BorderRadius.all(Radius.circular(2)))),
          const SizedBox(width: 9),
          Text(raid.myStatus == 'confirmed' ? 'Você está confirmado' : 'Você está na waitlist',
            style: const TextStyle(fontFamily: 'Jura', fontWeight: FontWeight.w600, color: HoloPalette.ink))])],
    ]));
  }
  Widget _chip(String t, {bool on = false}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(8),
      border: Border.all(color: on ? const Color(0x8C7E7BFF) : HoloPalette.glassBorderStrong)),
    child: Text(t, style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 1, color: on ? HoloPalette.indigo : HoloPalette.dim)));
}

class _Countdown extends StatefulWidget {
  const _Countdown({required this.raid});
  final MyRaid raid;
  @override State<_Countdown> createState() => _CountdownState();
}
class _CountdownState extends State<_Countdown> {
  Timer? _t;
  @override void initState() { super.initState(); _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {})); }
  @override void dispose() { _t?.cancel(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final d = widget.raid.startAt.difference(DateTime.now());
    final neg = d.isNegative; final a = d.abs();
    final txt = '${a.inHours.toString().padLeft(2, '0')}:${(a.inMinutes % 60).toString().padLeft(2, '0')}:${(a.inSeconds % 60).toString().padLeft(2, '0')}';
    return Padding(padding: const EdgeInsets.all(24), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(neg ? 'EM ANDAMENTO' : 'COMEÇA EM', style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 4, color: HoloPalette.faint)),
      const SizedBox(height: 8),
      FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(txt,
        style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w900, fontSize: 40, color: HoloPalette.ink,
          shadows: [Shadow(color: Color(0x5976C8FF), blurRadius: 22)]))),
      const SizedBox(height: 20),
      _CtaButton(label: 'VER RAID', onTap: () => context.push('/raids/${widget.raid.id}')),
    ]));
  }
}

class _Pulse extends StatefulWidget { const _Pulse(); @override State<_Pulse> createState() => _PulseState(); }
class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => FadeTransition(opacity: Tween(begin: .35, end: 1.0).animate(_c),
    child: Container(width: 7, height: 7, decoration: const BoxDecoration(shape: BoxShape.circle, color: HoloPalette.heal,
      boxShadow: [BoxShadow(color: HoloPalette.heal, blurRadius: 10)])));
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({required this.label, required this.onTap});
  final String label; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(width: double.infinity, child: DecoratedBox(
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(12),
      boxShadow: const [BoxShadow(color: Color(0x997E7BFF), blurRadius: 24, offset: Offset(0, 8))]),
    child: FilledButton(
      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14),
        backgroundColor: HoloPalette.blue, foregroundColor: const Color(0xFF0A0D1C),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      onPressed: onTap,
      child: Text(label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 13, letterSpacing: 2)))));
}
```

- [ ] **Step 4: Rodar** `flutter test next_raid_hero_test.dart` → PASS. Drenar timer: nos testes, terminar com `await tester.pump(const Duration(seconds: 1))` e `tester.pumpAndSettle` não (é contínuo) — usar `tester.pump` e no fim do teste o framework aceita timers de `Timer.periodic`? **Nota:** como há `Timer.periodic`, o teste deve envolver em `tester.runAsync` OU usar `await tester.pump()` sem settle; para evitar "Timer still pending", o widget cancela no `dispose` — garantir `pumpWidget` seguido de `pump` e fim de teste desmonta. Se acusar timer pendente, trocar por `addTearDown(() => tester.pumpWidget(const SizedBox()))`.

- [ ] **Step 5: `flutter analyze` limpo. Commit**
```bash
git add app/lib/features/home/widgets/next_raid_hero.dart app/test/features/home/next_raid_hero_test.dart
git commit -m "feat(app): NextRaidHero com countdown ao vivo e empty-state"
```

---

### Task 7: Montar a HomeScreen responsiva + skeleton + stagger

**Files:**
- Create: `app/lib/features/home/widgets/home_skeleton.dart`
- Modify: `app/lib/features/home/home_screen.dart` (reescrita)
- Test: `app/test/features/home/home_screen_test.dart`

**Interfaces:**
- Consumes: `meProvider`, `myRaidsProvider`, `charactersProvider`, `HoloBackground`, `HomeTopBar`, `NextRaidHero`, `StatTiles`, `NavGrid`, `nextRaid`, `activeRaidsCount`, `confirmedCount`.

- [ ] **Step 1: `home_skeleton.dart`** — blocos cinza com shimmer via `flutter_animate` (`.animate(onPlay:(c)=>c.repeat()).shimmer(...)`), no lugar de spinner. (hero placeholder + 3 tiles + grid placeholder.)

- [ ] **Step 2: Teste falho `home_screen_test.dart`** com overrides:
```dart
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/home/home_providers.dart';
import 'package:holoraid/features/home/home_screen.dart';
import 'package:holoraid/features/home/my_raid_model.dart';
import 'package:holoraid/features/characters/characters_providers.dart';
import 'package:holoraid/features/characters/character_model.dart';

Widget _app(List<Override> o) => ProviderScope(overrides: o, child: MaterialApp.router(
  routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())])));

List<Override> _overrides({required bool withRaid}) => [
  meProvider.overrideWith((ref) async => {'username': '.the.mentor', 'role': 'user', 'discord_id': '1', 'avatar': null}),
  charactersProvider.overrideWith((ref) async => <Character>[]),
  myRaidsProvider.overrideWith((ref) async => withRaid
    ? [MyRaid.fromJson({'id': 1, 'codigo': 'DF1', 'operation': 'The Dread Fortress', 'difficulty': 'veteran',
        'size': 8, 'faction': 'empire', 'start_at': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
        'status': 'OPEN', 'created': 0, 'my_status': 'confirmed'})]
    : <MyRaid>[]),
];

void main() {
  testWidgets('Home com raid renderiza wordmark, operation e navegação', (tester) async {
    await tester.pumpWidget(_app(_overrides(withRaid: true)));
    await tester.pump(); await tester.pump(const Duration(seconds: 2));
    expect(find.text('HoloRaid'), findsOneWidget);
    expect(find.text('The Dread Fortress'), findsOneWidget);
    expect(find.text('Raids'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('Home sem raid mostra empty-state', (tester) async {
    await tester.pumpWidget(_app(_overrides(withRaid: false)));
    await tester.pump(); await tester.pump(const Duration(seconds: 2));
    expect(find.textContaining('Nenhuma operation'), findsOneWidget);
  });

  testWidgets('Home em viewport estreito não estoura (sem RenderFlex overflow)', (tester) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final errors = <FlutterErrorDetails>[];
    final prev = FlutterError.onError;
    FlutterError.onError = (d) { errors.add(d); };
    await tester.pumpWidget(_app(_overrides(withRaid: true)));
    await tester.pump(); await tester.pump(const Duration(seconds: 2));
    FlutterError.onError = prev;
    expect(errors.where((e) => e.exceptionAsString().contains('overflow')), isEmpty);
  });
}
```

- [ ] **Step 3: Rodar** → FAIL.

- [ ] **Step 4: Reescrever `home_screen.dart`** — `Scaffold` transparente + `HoloBackground` + `SafeArea` + `SingleChildScrollView` + `ConstrainedBox(maxWidth: 1120)` + `LayoutBuilder(compact = w < 720)`; combina `AsyncValue`s (loading → `HomeSkeleton`; erro → mensagem inline; data → conteúdo). Stagger de entrada via `flutter_animate`.
```dart
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/holo_background.dart';
import '../../core/ui/holo_palette.dart';
import '../characters/characters_providers.dart';
import 'home_providers.dart';
import 'my_raid_model.dart';
import 'widgets/home_top_bar.dart';
import 'widgets/next_raid_hero.dart';
import 'widgets/stat_tiles.dart';
import 'widgets/nav_grid.dart';
import 'widgets/home_skeleton.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final raids = ref.watch(myRaidsProvider);
    final chars = ref.watch(charactersProvider);
    return Scaffold(
      backgroundColor: HoloPalette.bgMid,
      body: HoloBackground(child: SafeArea(child: LayoutBuilder(builder: (context, c) {
        final compact = c.maxWidth < 720;
        return SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 28, vertical: 24),
          child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1120),
            child: me.when(
              loading: () => const HomeSkeleton(),
              error: (e, _) => _error(context, ref),
              data: (meData) {
                final isAdmin = (meData['role'] as String?) == 'admin';
                final raidList = raids.valueOrNull ?? const <MyRaid>[];
                final next = nextRaid(raidList, DateTime.now());
                int i = 0;
                Widget stg(Widget w) { final d = (i++ * 70).ms;
                  return w.animate().fadeIn(delay: d, duration: 250.ms, curve: Curves.easeOut)
                    .slideY(begin: .1, end: 0, delay: d, duration: 250.ms, curve: Curves.easeOutCubic); }
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  stg(HomeTopBar(me: meData, compact: compact, onLogout: () => ref.read(authStateProvider.notifier).logout())),
                  SizedBox(height: compact ? 24 : 32),
                  stg(const _Eyebrow()),
                  const SizedBox(height: 14),
                  stg(raids.isLoading ? const HeroSkeleton() : NextRaidHero(raid: next, compact: compact)),
                  SizedBox(height: compact ? 20 : 26),
                  stg(StatTiles(raids: activeRaidsCount(raidList), chars: chars.valueOrNull?.length ?? 0,
                    confirmed: confirmedCount(raidList), compact: compact)),
                  SizedBox(height: compact ? 22 : 28),
                  stg(const _NavLabel()),
                  const SizedBox(height: 14),
                  stg(NavGrid(isAdmin: isAdmin, compact: compact)),
                  const SizedBox(height: 30),
                ]);
              },
            ))),
        );
      }))),
    );
  }

  Widget _error(BuildContext context, WidgetRef ref) => Padding(padding: const EdgeInsets.all(40),
    child: Column(children: [
      const Text('Não foi possível carregar seus dados.', style: TextStyle(fontFamily: 'Jura', color: HoloPalette.dim)),
      const SizedBox(height: 12),
      TextButton(onPressed: () { ref.invalidate(meProvider); ref.invalidate(myRaidsProvider); }, child: const Text('Tentar de novo')),
    ]));
}

class _Eyebrow extends StatelessWidget { const _Eyebrow();
  @override Widget build(BuildContext context) => const Text.rich(TextSpan(children: [
    TextSpan(text: 'CENTRO DE '), TextSpan(text: 'COMANDO', style: TextStyle(color: HoloPalette.blue))]),
    style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 5, color: HoloPalette.faint)); }

class _NavLabel extends StatelessWidget { const _NavLabel();
  @override Widget build(BuildContext context) => const Text('NAVEGAÇÃO',
    style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 4, color: HoloPalette.faint)); }
```
> Nota: `HeroSkeleton` e `HomeSkeleton` vêm de `home_skeleton.dart` (Step 1). `raids.isLoading` mostra o skeleton do hero enquanto `/me/raids` carrega, sem travar o resto.

- [ ] **Step 5: Rodar** `flutter test` → os 3 testes PASS. Se acusar timer pendente do countdown/pulse, os `pump(2s)` + desmontagem no fim resolvem; caso persista, envolver o corpo do teste em `tester.runAsync`.

- [ ] **Step 6: `flutter analyze` limpo. Commit**
```bash
git add app/lib/features/home/home_screen.dart app/lib/features/home/widgets/home_skeleton.dart app/test/features/home/home_screen_test.dart
git commit -m "feat(app): Home command center responsiva (skeleton + stagger + dados reais)"
```

---

### Task 8: Verificação visual real (desktop + celular)

**Files:** nenhum (validação manual + screenshots).

- [ ] **Step 1: Build web** (PowerShell): `flutter build web --dart-define=API_BASE_URL=http://localhost:3010`.
- [ ] **Step 2: Servir** e abrir; logar; conferir a Home em **desktop** (largura ~1200) e **celular** (DevTools responsive 390–430). Checar: sem corte horizontal, wordmark/gradiente ok, countdown correndo, avatar do Discord real, tiles e nav reflowando (2→1 coluna).
- [ ] **Step 3:** Ajustes finos de espaçamento/tamanho se necessário (sem novos recursos).
- [ ] **Step 4: Commit** (se houver ajustes): `git commit -m "polish(app): ajustes finos da Home mobile/desktop"`.

---

### Task 9 (opcional): Fragment shader de fundo

> Enhancement. A Home já bate o mockup aprovado sem shader (gradiente+starfield+glow). Fazer só se sobrar tempo e sem regressão. Se o shader falhar em qualquer plataforma, manter o fallback (Task 3) — não bloquear.

**Files:**
- Create: `app/assets/shaders/holo_bg.frag`
- Modify: `app/pubspec.yaml` (`shaders:`), `app/lib/core/ui/holo_background.dart`

- [ ] **Step 1: `holo_bg.frag`**:
```glsl
#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;
  float g = 0.5 + 0.5 * sin(uTime * 0.15 + uv.x * 3.0 + uv.y * 2.0);
  vec3 a = vec3(0.031, 0.031, 0.086);   // #080816
  vec3 b = vec3(0.043, 0.059, 0.157);   // #0B0F28
  vec3 col = mix(a, b, g * (1.0 - uv.y * 0.5));
  fragColor = vec4(col, 1.0);
}
```
- [ ] **Step 2: `pubspec.yaml`** sob `flutter:`:
```yaml
  shaders:
    - assets/shaders/holo_bg.frag
```
- [ ] **Step 3:** No `HoloBackground`, carregar `FragmentProgram.fromAsset('assets/shaders/holo_bg.frag')` (FutureBuilder) e pintar via `CustomPaint` com `uTime` de um `Ticker` (respeitando `reduceMotion`); enquanto não carrega ou em erro/reduce → gradiente atual. Manter o starfield por cima.
- [ ] **Step 4:** `flutter analyze` + `flutter test` verdes; conferir web e mobile sem regressão.
- [ ] **Step 5: Commit** `git commit -m "feat(app): fragment shader holografico no fundo (com fallback)"`.

---

## Self-Review

- **Cobertura do spec:** tema global (T1), camada core/ui + wordmark/starfield/glass (T2), HoloBackground + reduzir-animações (T3), dados/`/me`/`/me/raids`/`/characters` + próxima raid (T4), TopBar+avatar Discord/StatTiles/NavGrid+admin gating (T5), NextRaidHero+countdown+empty-state (T6), Home responsiva+skeleton+stagger+estados (T7), responsividade/verificação mobile (T5/T7/T8), shader (T9). ✔
- **Placeholders:** nenhum "TBD/TODO"; código presente em cada step. ✔
- **Consistência de tipos:** `MyRaid`/`nextRaid`/`activeRaidsCount`/`confirmedCount` (T4) usados igual em T6/T7; `HoloPalette`/`HoloWordmark`/`GlassCard`/`Starfield`/`HoloBackground` estáveis entre tarefas. ✔
- **Riscos:** timers (`Timer.periodic`/pulse) nos testes → mitigado com `pump(2s)`+desmontagem/`runAsync`; shader isolado como opcional com fallback.
