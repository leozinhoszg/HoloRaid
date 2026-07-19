import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/ui/holo_palette.dart';

Widget _block(double h, {double? w, double radius = 16}) => Container(
      height: h,
      width: w,
      decoration: BoxDecoration(
        color: HoloPalette.glassFill,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: HoloPalette.glassBorder),
      ),
    ).animate(onPlay: (c) => c.repeat()).shimmer(
        duration: 1400.ms, color: const Color(0x22AEB6FF));

/// Placeholder do hero (usado enquanto /me/raids carrega).
class HeroSkeleton extends StatelessWidget {
  const HeroSkeleton({super.key});
  @override
  Widget build(BuildContext context) => _block(compactHeight(context), radius: 22);

  double compactHeight(BuildContext context) =>
      MediaQuery.of(context).size.width < 720 ? 320 : 210;
}

/// Skeleton da Home inteira (enquanto /me carrega).
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});
  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.of(context).size.width < 720;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [_block(34, w: 140), const Spacer(), _block(48, w: 160, radius: 40)]),
      SizedBox(height: compact ? 24 : 32),
      _block(compact ? 320 : 210, radius: 22),
      SizedBox(height: compact ? 20 : 26),
      if (compact) ...[
        _block(88), const SizedBox(height: 12), _block(88), const SizedBox(height: 12), _block(88),
      ] else
        Row(children: [
          Expanded(child: _block(96)), const SizedBox(width: 14),
          Expanded(child: _block(96)), const SizedBox(width: 14),
          Expanded(child: _block(96)),
        ]),
      SizedBox(height: compact ? 22 : 28),
      _block(120, radius: 16),
    ]);
  }
}
