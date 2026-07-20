import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../core/ui/glass_card.dart';
import '../../../core/ui/holo_palette.dart';

/// Três tiles de status. Wide: linha (Expanded); compact: coluna empilhada.
class StatTiles extends StatelessWidget {
  const StatTiles({
    super.key,
    required this.raids,
    required this.chars,
    required this.confirmed,
    required this.compact,
  });
  final int raids, chars, confirmed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      _tile('home.stat_active_raids'.tr(), '$raids', HoloPalette.blue),
      _tile('home.stat_characters'.tr(), '$chars', HoloPalette.heal),
      _tile('home.stat_confirmations'.tr(), '$confirmed', HoloPalette.dps),
    ];
    if (compact) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          tiles[i],
        ],
      ]);
    }
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(width: 14),
          Expanded(child: tiles[i]),
        ],
      ]),
    );
  }

  Widget _tile(String k, String v, Color c) => GlassCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.faint)),
          const SizedBox(height: 10),
          Text(v, style: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 30, color: c)),
        ]),
      );
}
