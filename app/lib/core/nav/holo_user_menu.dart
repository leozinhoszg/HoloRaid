import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_providers.dart';
import '../settings/settings_providers.dart';
import '../ui/holo_avatar.dart';
import '../ui/holo_palette.dart';
import '../../features/home/home_providers.dart';

/// Menu do usuário: avatar → Perfil / Reduzir animações / Admin (se admin) / Sair.
class HoloUserMenu extends ConsumerWidget {
  const HoloUserMenu({super.key, this.avatarSize = 38});
  final double avatarSize;

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

    return MenuAnchor(
      style: MenuStyle(
        backgroundColor: const WidgetStatePropertyAll(Color(0xF2101430)),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: const WidgetStatePropertyAll(10),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 6)),
        minimumSize: const WidgetStatePropertyAll(Size(220, 0)),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: HoloPalette.glassBorderStrong),
        )),
      ),
      alignmentOffset: const Offset(-160, 6),
      builder: (context, controller, child) => InkWell(
        borderRadius: BorderRadius.circular(30),
        onTap: () => controller.isOpen ? controller.close() : controller.open(),
        child: HoloAvatar(url: url, label: name, size: avatarSize),
      ),
      menuChildren: [
        _item(Icons.person_outline, 'Perfil', () => context.push('/profile')),
        const _ReduceMotionItem(),
        if (isAdmin) _item(Icons.shield_outlined, 'Admin', () => context.push('/admin/users')),
        const Divider(height: 8, color: HoloPalette.glassBorder),
        _item(Icons.logout, 'Sair', () => ref.read(authStateProvider.notifier).logout(), danger: true),
      ],
    );
  }

  Widget _item(IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? HoloPalette.red : HoloPalette.ink;
    return MenuItemButton(
      onPressed: onTap,
      leadingIcon: Icon(icon, size: 18, color: danger ? HoloPalette.red : HoloPalette.dim),
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(220, 42)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 14)),
        overlayColor: const WidgetStatePropertyAll(Color(0x2276C8FF)),
        textStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: 'Jura', fontSize: 14)),
        foregroundColor: WidgetStatePropertyAll(color),
      ),
      child: Align(alignment: Alignment.centerLeft, child: Text(label)),
    );
  }
}

/// Item com Switch que NÃO fecha o menu ao alternar (não é MenuItemButton).
class _ReduceMotionItem extends ConsumerWidget {
  const _ReduceMotionItem();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final on = ref.watch(reduceMotionProvider);
    return InkWell(
      onTap: () => ref.read(reduceMotionProvider.notifier).state = !on,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Row(children: [
          const Icon(Icons.motion_photos_pause_outlined, size: 18, color: HoloPalette.dim),
          const SizedBox(width: 12),
          const Expanded(
              child: Text('Reduzir animações', style: TextStyle(fontFamily: 'Jura', fontSize: 14, color: HoloPalette.ink))),
          Switch(value: on, onChanged: (v) => ref.read(reduceMotionProvider.notifier).state = v),
        ]),
      ),
    );
  }
}
