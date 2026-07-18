import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/ui/glass_card.dart';
import '../../../core/ui/holo_palette.dart';

/// Grid de navegação responsivo (5 col wide, 2 col tablet/phone, 1 col muito estreito).
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
      const gap = 14.0;
      final w = (c.maxWidth - gap * (cols - 1)) / cols;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: items.map((it) => SizedBox(width: w, child: _Tile(it: it, compact: compact))).toList(),
      );
    });
  }
}

class _Item {
  final Color color;
  final String label, desc;
  final IconData icon;
  final String route;
  const _Item(this.color, this.label, this.desc, this.icon, this.route);
}

class _Tile extends StatelessWidget {
  const _Tile({required this.it, required this.compact});
  final _Item it;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push(it.route),
      child: GlassCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(11),
              border: Border.all(color: HoloPalette.glassBorderStrong),
            ),
            child: Icon(it.icon, color: it.color, size: 20),
          ),
          const SizedBox(height: 14),
          Text(it.label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 13, letterSpacing: 1, color: HoloPalette.ink)),
          if (!compact) ...[
            const SizedBox(height: 4),
            Text(it.desc, style: const TextStyle(fontFamily: 'Jura', fontSize: 11, color: HoloPalette.faint)),
          ],
        ]),
      ),
    );
  }
}
