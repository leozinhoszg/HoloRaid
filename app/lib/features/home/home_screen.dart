import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/holo_background.dart';
import '../../core/ui/holo_palette.dart';
import '../characters/characters_providers.dart';
import 'home_providers.dart';
import 'my_raid_model.dart';
import 'widgets/home_skeleton.dart';
import 'widgets/home_top_bar.dart';
import 'widgets/nav_grid.dart';
import 'widgets/next_raid_hero.dart';
import 'widgets/stat_tiles.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    final raids = ref.watch(myRaidsProvider);
    final chars = ref.watch(charactersProvider);
    return Scaffold(
      backgroundColor: HoloPalette.bgMid,
      body: HoloBackground(
        child: SafeArea(
          child: LayoutBuilder(builder: (context, c) {
            final compact = c.maxWidth < 720;
            return SingleChildScrollView(
              padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 28, vertical: 24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1120),
                  child: me.when(
                    loading: () => const HomeSkeleton(),
                    error: (e, _) => _error(context, ref),
                    data: (meData) {
                      final isAdmin = (meData['role'] as String?) == 'admin';
                      final raidList = raids.valueOrNull ?? const <MyRaid>[];
                      final next = nextRaid(raidList, DateTime.now());
                      var i = 0;
                      Widget stg(Widget w) {
                        final d = (i++ * 70).ms;
                        return w
                            .animate()
                            .fadeIn(delay: d, duration: 250.ms, curve: Curves.easeOut)
                            .slideY(begin: .1, end: 0, delay: d, duration: 250.ms, curve: Curves.easeOutCubic);
                      }

                      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        stg(HomeTopBar(
                          me: meData,
                          compact: compact,
                          onLogout: () => ref.read(authStateProvider.notifier).logout(),
                        )),
                        SizedBox(height: compact ? 24 : 32),
                        stg(const _Eyebrow()),
                        const SizedBox(height: 14),
                        stg(raids.isLoading
                            ? const HeroSkeleton()
                            : NextRaidHero(raid: next, compact: compact)),
                        SizedBox(height: compact ? 20 : 26),
                        stg(StatTiles(
                          raids: activeRaidsCount(raidList),
                          chars: chars.valueOrNull?.length ?? 0,
                          confirmed: confirmedCount(raidList),
                          compact: compact,
                        )),
                        SizedBox(height: compact ? 22 : 28),
                        stg(const _NavLabel()),
                        const SizedBox(height: 14),
                        stg(NavGrid(isAdmin: isAdmin, compact: compact)),
                        const SizedBox(height: 30),
                      ]);
                    },
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget _error(BuildContext context, WidgetRef ref) => Padding(
        padding: const EdgeInsets.all(40),
        child: Column(children: [
          const Text('Não foi possível carregar seus dados.',
              style: TextStyle(fontFamily: 'Jura', color: HoloPalette.dim)),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () {
              ref.invalidate(meProvider);
              ref.invalidate(myRaidsProvider);
            },
            child: const Text('Tentar de novo'),
          ),
        ]),
      );
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow();
  @override
  Widget build(BuildContext context) => const Text.rich(
        TextSpan(children: [
          TextSpan(text: 'CENTRO DE '),
          TextSpan(text: 'COMANDO', style: TextStyle(color: HoloPalette.blue)),
        ]),
        style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 5, color: HoloPalette.faint),
      );
}

class _NavLabel extends StatelessWidget {
  const _NavLabel();
  @override
  Widget build(BuildContext context) => const Text('NAVEGAÇÃO',
      style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 4, color: HoloPalette.faint));
}
