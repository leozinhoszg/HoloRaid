import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';
import 'nav_destinations.dart';

/// Item de navegação compartilhado entre a sidebar e o drawer.
class NavTile extends StatelessWidget {
  const NavTile({super.key, required this.dest, required this.active, required this.onTap});
  final NavDestination dest;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: active ? const Color(0x1A76C8FF) : Colors.transparent,
              border: Border.all(color: active ? HoloPalette.glassBorderStrong : Colors.transparent),
            ),
            child: Row(children: [
              Container(
                width: 3,
                height: 20,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(2),
                  color: active ? dest.color : Colors.transparent,
                ),
              ),
              const SizedBox(width: 12),
              Icon(dest.icon, size: 20, color: active ? dest.color : HoloPalette.dim),
              const SizedBox(width: 14),
              Text(dest.label,
                  style: TextStyle(
                    fontFamily: 'Aldrich',
                    fontSize: 13,
                    letterSpacing: .5,
                    color: active ? HoloPalette.ink : HoloPalette.dim,
                  )),
            ]),
          ),
        ),
      ),
    );
  }
}
