import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../settings/settings_providers.dart';
import '../ui/holo_palette.dart';
import 'holo_drawer.dart';
import 'holo_sidebar.dart';
import 'holo_user_menu.dart';
import 'nav_destinations.dart';

/// Shell responsivo: sidebar (>=900px) ou AppBar+Drawer (<900px), com menu de
/// usuário e FAB por seção. As telas-destino renderizam em `child` (body-only).
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final title = titleForLocation(location);
    final fab = fabForLocation(location);
    final reduce = ref.watch(reduceMotionProvider) || MediaQuery.of(context).disableAnimations;

    // Entrada suave e barata do conteúdo ao trocar de destino: fade + slide
    // sutil (não desliza toda a tela → não re-borra o glass como o cross-fade).
    // A `key` por location faz o efeito rerodar a cada navegação.
    Widget content = child;
    if (!reduce) {
      content = Animate(
        key: ValueKey(location),
        effects: const [
          FadeEffect(duration: Duration(milliseconds: 220), curve: Curves.easeOut),
          SlideEffect(
              begin: Offset(0, .025), end: Offset.zero, duration: Duration(milliseconds: 260), curve: Curves.easeOutCubic),
        ],
        child: child,
      );
    }
    final fabWidget = fab == null
        ? null
        : FloatingActionButton.extended(
            onPressed: () => context.push(fab.route),
            icon: Icon(fab.icon),
            label: Text(fab.label, style: const TextStyle(fontFamily: 'Aldrich', letterSpacing: 1)),
          );

    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 900;
      if (wide) {
        return Scaffold(
          floatingActionButton: fabWidget,
          body: SafeArea(
            child: Row(children: [
              const HoloSidebar(),
              Expanded(
                child: Column(children: [
                  _TopBar(title: title),
                  Expanded(child: content),
                ]),
              ),
            ]),
          ),
        );
      }
      return Scaffold(
        appBar: AppBar(
          titleSpacing: 8,
          title: Text(title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 17, color: HoloPalette.ink)),
          actions: const [Padding(padding: EdgeInsets.only(right: 8), child: Center(child: HoloUserMenu()))],
        ),
        drawer: const HoloDrawer(),
        floatingActionButton: fabWidget,
        body: SafeArea(child: content),
      );
    });
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 18, 20, 14),
      child: Row(children: [
        Expanded(
          child: Text(title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 22, color: HoloPalette.ink)),
        ),
        const SizedBox(width: 16),
        const HoloUserMenu(),
      ]),
    );
  }
}
