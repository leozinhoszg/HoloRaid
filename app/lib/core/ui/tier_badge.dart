import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Cor do Tier (fria→quente): 0 cinza, 1–2 azul, 3–4 violeta (marca), 5 dourado, 6 glow.
Color tierColor(int tier) {
  switch (tier) {
    case 1:
    case 2:
      return HoloPalette.blue;
    case 3:
    case 4:
      return HoloPalette.indigo;
    case 5:
      return HoloPalette.gold;
    case 6:
      return HoloPalette.dps; // ápice quente
    default:
      return HoloPalette.faint;
  }
}

class TierBadge extends StatelessWidget {
  final int tier;
  final bool compact;
  const TierBadge({super.key, required this.tier, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final c = tierColor(tier);
    final label = tier == 0 ? 'Sem Tier' : 'Tier $tier';
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 3 : 5),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withValues(alpha: 0.55)),
        boxShadow: tier >= 6 ? [BoxShadow(color: c.withValues(alpha: 0.45), blurRadius: 10)] : null,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Aldrich', fontSize: compact ? 10 : 12, letterSpacing: 0.5,
          color: c, fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
