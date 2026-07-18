import 'dart:ui';
import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Card glassmorphism (blur + fill translúcido + borda). Usado em cards especiais.
class GlassCard extends StatelessWidget {
  const GlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(16)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: HoloPalette.glassFill,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: HoloPalette.glassBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}
