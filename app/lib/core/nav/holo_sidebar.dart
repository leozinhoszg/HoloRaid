import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/holo_palette.dart';
import '../ui/holo_wordmark.dart';
import '../../features/home/home_providers.dart';
import 'nav_destinations.dart';
import 'nav_tile.dart';

/// Barra lateral glass (desktop). Wordmark no topo + destinos com item ativo.
class HoloSidebar extends ConsumerWidget {
  const HoloSidebar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAdmin = (ref.watch(meProvider).valueOrNull?['role']) == 'admin';
    final location = GoRouterState.of(context).matchedLocation;
    final dests = navDestinations(isAdmin: isAdmin);
    return Container(
      width: 240,
      decoration: const BoxDecoration(
        color: Color(0x66101430),
        border: Border(right: BorderSide(color: HoloPalette.glassBorder)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(padding: EdgeInsets.fromLTRB(20, 24, 20, 24), child: HoloWordmark(size: 26)),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.only(top: 4),
            children: dests
                .map((d) => NavTile(
                      dest: d,
                      active: isDestinationActive(d.route, location),
                      onTap: () => context.go(d.route),
                    ))
                .toList(),
          ),
        ),
      ]),
    );
  }
}
