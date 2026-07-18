import 'package:flutter/material.dart';
import '../../../core/ui/holo_palette.dart';
import '../../../core/ui/holo_wordmark.dart';

/// Barra superior: wordmark + chip do usuário (avatar Discord real com fallback) + logout.
class HomeTopBar extends StatelessWidget {
  const HomeTopBar({super.key, required this.me, required this.compact, required this.onLogout});
  final Map<String, dynamic> me;
  final bool compact;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final name = me['username'] as String? ?? '—';
    final role = (me['role'] as String? ?? 'user').toUpperCase();
    final discordId = me['discord_id']?.toString();
    final avatar = me['avatar'] as String?;
    final url = (discordId != null && avatar != null && avatar.isNotEmpty)
        ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png'
        : null;
    return Row(children: [
      HoloWordmark(size: compact ? 26 : 34),
      const Spacer(),
      Flexible(
        child: Container(
          padding: const EdgeInsets.fromLTRB(6, 6, 8, 6),
          decoration: BoxDecoration(
            color: HoloPalette.glassFill,
            border: Border.all(color: HoloPalette.glassBorderStrong),
            borderRadius: BorderRadius.circular(40),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            _Avatar(url: url, name: name, size: compact ? 34 : 40),
            const SizedBox(width: 9),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontFamily: 'Aldrich', fontSize: compact ? 12 : 14, color: HoloPalette.ink)),
                  if (!compact)
                    Text('OPERATIVE · $role',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 2, color: HoloPalette.indigo)),
                ],
              ),
            ),
            const SizedBox(width: 4),
            IconButton(
              onPressed: onLogout,
              iconSize: 18,
              color: HoloPalette.dim,
              icon: const Icon(Icons.logout),
              tooltip: 'Sair',
              constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
              padding: EdgeInsets.zero,
            ),
          ]),
        ),
      ),
    ]);
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.url, required this.name, required this.size});
  final String? url;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final clean = name.replaceAll('.', '');
    final initial = clean.isEmpty ? '?' : clean.substring(0, 1).toUpperCase();
    final fallback = Text(initial,
        style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.blue));
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: SweepGradient(colors: [
          HoloPalette.blue, HoloPalette.indigo, HoloPalette.heal, HoloPalette.dps, HoloPalette.red, HoloPalette.blue,
        ]),
      ),
      child: ClipOval(
        child: Container(
          color: const Color(0xFF0D1024),
          alignment: Alignment.center,
          child: url == null
              ? fallback
              : Image.network(url!, fit: BoxFit.cover, width: size, height: size,
                  errorBuilder: (_, _, _) => fallback),
        ),
      ),
    );
  }
}
