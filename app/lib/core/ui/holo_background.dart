import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../settings/settings_providers.dart';
import 'holo_palette.dart';
import 'starfield.dart';

/// Fundo holográfico: gradiente base + starfield + glows radiais.
/// Respeita "reduzir animações" (some o starfield).
class HoloBackground extends ConsumerWidget {
  const HoloBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reduce = ref.watch(reduceMotionProvider) || MediaQuery.of(context).disableAnimations;
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -1),
              radius: 1.3,
              colors: [HoloPalette.bgMid, HoloPalette.bgTop, HoloPalette.bgBottom],
              stops: [0, .45, 1],
            ),
          ),
        ),
        if (!reduce) const Starfield(),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(-.7, -.8),
              radius: 1.1,
              colors: [Color(0x1A76C8FF), Color(0x0076C8FF)],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(.9, 1.2),
              radius: 1.2,
              colors: [Color(0x1F7E7BFF), Color(0x007E7BFF)],
            ),
          ),
        ),
        child,
      ],
    );
  }
}
