import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/holo_avatar.dart';
import '../ui/holo_palette.dart';
import '../../features/home/home_providers.dart';
import 'nav_destinations.dart';
import 'nav_tile.dart';

/// Drawer glass (mobile). Mini-perfil no topo + destinos; fecha ao navegar.
class HoloDrawer extends ConsumerWidget {
  const HoloDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull ?? const {};
    final name = me['username'] as String? ?? '—';
    final role = me['role'] as String? ?? 'user';
    final isAdmin = role == 'admin';
    final discordId = me['discord_id']?.toString();
    final avatar = me['avatar'] as String?;
    final url = (discordId != null && avatar != null && avatar.isNotEmpty)
        ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png'
        : null;
    final location = GoRouterState.of(context).matchedLocation;
    final dests = navDestinations(isAdmin: isAdmin);

    return Drawer(
      backgroundColor: const Color(0xF20B0F28),
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
            child: Row(children: [
              HoloAvatar(url: url, label: name, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontFamily: 'Aldrich', fontSize: 14, color: HoloPalette.ink)),
                  Text(role.toUpperCase(),
                      style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 2, color: HoloPalette.indigo)),
                ]),
              ),
            ]),
          ),
          const Divider(height: 1, color: HoloPalette.glassBorder),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(top: 8),
              children: dests
                  .map((d) => NavTile(
                        dest: d,
                        active: isDestinationActive(d.route, location),
                        onTap: () {
                          Navigator.of(context).pop(); // fecha o drawer
                          context.go(d.route);
                        },
                      ))
                  .toList(),
            ),
          ),
        ]),
      ),
    );
  }
}
