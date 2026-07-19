import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/ui/holo_palette.dart';
import '../characters/characters_providers.dart';
import 'home_providers.dart';
import 'my_raid_model.dart';
import 'widgets/home_skeleton.dart';
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
      body: SafeArea(
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
                        const SizedBox(height: 30),
                      ]);
                    },
                  ),
                ),
              ),
            );
          }),
        ),
    );
  }

  Widget _error(BuildContext context, WidgetRef ref) => Padding(
        padding: const EdgeInsets.all(40),
        child: Column(children: [
          Text('home.error_load'.tr(),
              style: const TextStyle(fontFamily: 'Jura', color: HoloPalette.dim)),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () {
              ref.invalidate(meProvider);
              ref.invalidate(myRaidsProvider);
            },
            child: Text('common.retry'.tr()),
          ),
        ]),
      );
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow();
  @override
  Widget build(BuildContext context) => Text.rich(
        TextSpan(children: [
          TextSpan(text: 'home.eyebrow_prefix'.tr()),
          TextSpan(text: 'home.eyebrow_accent'.tr(), style: const TextStyle(color: HoloPalette.blue)),
        ]),
        style: const TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 5, color: HoloPalette.faint),
      );
}
