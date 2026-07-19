import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';

class NavDestination {
  final String route, label;
  final IconData icon;
  final Color color;
  const NavDestination({required this.route, required this.label, required this.icon, required this.color});
}

List<NavDestination> navDestinations({required bool isAdmin}) => [
      NavDestination(route: '/home', label: 'nav.home'.tr(), icon: Icons.dashboard_outlined, color: HoloPalette.indigo),
      NavDestination(route: '/characters', label: 'nav.characters'.tr(), icon: Icons.people_alt_outlined, color: HoloPalette.indigo),
      NavDestination(route: '/progression', label: 'nav.progression'.tr(), icon: Icons.checklist, color: HoloPalette.gold),
      NavDestination(route: '/raids', label: 'nav.raids'.tr(), icon: Icons.calendar_month_outlined, color: HoloPalette.blue),
      NavDestination(route: '/dashboard', label: 'nav.dashboard'.tr(), icon: Icons.bar_chart, color: HoloPalette.heal),
      if (isAdmin) NavDestination(route: '/admin/users', label: 'nav.admin'.tr(), icon: Icons.shield_outlined, color: HoloPalette.red),
    ];

bool isDestinationActive(String route, String location) =>
    route == '/home' ? location == '/home' : location.startsWith(route);

class NavFab {
  final String label;
  final IconData icon;
  final String route;
  const NavFab(this.label, this.icon, this.route);
}

NavFab? fabForLocation(String location) {
  if (location == '/characters') return NavFab('nav.fab_new'.tr(), Icons.add, '/characters/new');
  if (location == '/raids') return NavFab('nav.fab_create_raid'.tr(), Icons.add, '/raids/new');
  return null;
}

/// Título da seção; usa o primeiro destino cujo route casa (admin incluído p/ resolver /admin/*).
String titleForLocation(String location) {
  for (final d in navDestinations(isAdmin: true)) {
    if (isDestinationActive(d.route, location)) return d.label;
  }
  return 'HoloRaid';
}
