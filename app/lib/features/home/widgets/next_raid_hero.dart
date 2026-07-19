import 'dart:async';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/ui/holo_palette.dart';
import '../my_raid_model.dart';

/// Card herói da próxima raid: detalhes + countdown ao vivo + CTA. Empty-state quando null.
class NextRaidHero extends StatelessWidget {
  const NextRaidHero({super.key, required this.raid, required this.compact});
  final MyRaid? raid;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xB8141A36), Color(0x990A0D1E)],
          ),
          border: Border.all(color: HoloPalette.glassBorderStrong),
          borderRadius: BorderRadius.circular(22),
        ),
        child: raid == null ? _empty(context) : _content(context, raid!),
      ),
    );
  }

  Widget _empty(BuildContext context) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('home.no_op_eyebrow'.tr(),
              style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.faint)),
          const SizedBox(height: 12),
          Text('home.no_op_title'.tr(), style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text('home.no_op_body'.tr(),
              style: const TextStyle(fontFamily: 'Jura', color: HoloPalette.dim)),
          const SizedBox(height: 20),
          _CtaButton(label: 'home.view_raids'.tr(), onTap: () => context.push('/raids')),
        ]),
      );

  Widget _content(BuildContext context, MyRaid r) {
    final left = _Details(raid: r);
    final right = _Countdown(raid: r);
    final body = compact
        ? Column(children: [left, const Divider(height: 1, color: HoloPalette.glassBorder), right])
        : IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(flex: 3, child: left),
              const VerticalDivider(width: 1, color: HoloPalette.glassBorder),
              Expanded(flex: 2, child: right),
            ]),
          );
    // Faixa lateral gradiente por cima (Positioned evita depender de altura intrínseca
    // dentro de um scroll view vertical, que é ilimitado).
    return Stack(children: [
      body,
      const Positioned(
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [HoloPalette.blue, HoloPalette.indigo, HoloPalette.dps],
            ),
          ),
        ),
      ),
    ]);
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.raid});
  final MyRaid raid;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          const _Pulse(),
          const SizedBox(width: 7),
          Text('home.next_operation'.tr(),
              style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 3, color: HoloPalette.heal)),
        ]),
        const SizedBox(height: 14),
        Text(raid.operation,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 26, color: HoloPalette.ink)),
        const SizedBox(height: 6),
        Text('home.raid_code'.tr(namedArgs: {'code': raid.codigo}), style: const TextStyle(fontFamily: 'Jura', fontSize: 13, color: HoloPalette.faint)),
        const SizedBox(height: 16),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _chip(raid.difficulty.toUpperCase(), on: true),
          _chip('home.man_size'.tr(namedArgs: {'n': '${raid.size}'})),
          _chip(raid.faction.toUpperCase()),
        ]),
        if (raid.myStatus != null) ...[
          const SizedBox(height: 16),
          Row(children: [
            Container(width: 9, height: 9, decoration: const BoxDecoration(color: HoloPalette.dps, borderRadius: BorderRadius.all(Radius.circular(2)))),
            const SizedBox(width: 9),
            Text(raid.myStatus == 'confirmed' ? 'home.status_confirmed'.tr() : 'home.status_waitlist'.tr(),
                style: const TextStyle(fontFamily: 'Jura', fontWeight: FontWeight.w600, color: HoloPalette.ink)),
          ]),
        ],
      ]),
    );
  }

  Widget _chip(String t, {bool on = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: on ? const Color(0x8C7E7BFF) : HoloPalette.glassBorderStrong),
        ),
        child: Text(t, style: TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 1, color: on ? HoloPalette.indigo : HoloPalette.dim)),
      );
}

class _Countdown extends StatefulWidget {
  const _Countdown({required this.raid});
  final MyRaid raid;
  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.raid.startAt.difference(DateTime.now());
    final neg = d.isNegative;
    final a = d.abs();
    final txt =
        '${a.inHours.toString().padLeft(2, '0')}:${(a.inMinutes % 60).toString().padLeft(2, '0')}:${(a.inSeconds % 60).toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(neg ? 'home.in_progress'.tr() : 'home.starts_in'.tr(),
            style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 4, color: HoloPalette.faint)),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(txt,
              style: const TextStyle(
                  fontFamily: 'Orbitron',
                  fontWeight: FontWeight.w900,
                  fontSize: 40,
                  color: HoloPalette.ink,
                  shadows: [Shadow(color: Color(0x5976C8FF), blurRadius: 22)])),
        ),
        const SizedBox(height: 20),
        _CtaButton(label: 'home.view_raid'.tr(), onTap: () => context.push('/raids/${widget.raid.id}')),
      ]),
    );
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse();
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: .35, end: 1.0).animate(_c),
        child: Container(
          width: 7,
          height: 7,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: HoloPalette.heal,
            boxShadow: [BoxShadow(color: HoloPalette.heal, blurRadius: 10)],
          ),
        ),
      );
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [BoxShadow(color: Color(0x997E7BFF), blurRadius: 24, offset: Offset(0, 8))],
          ),
          child: FilledButton(
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: HoloPalette.blue,
              foregroundColor: const Color(0xFF0A0D1C),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: onTap,
            child: Text(label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 13, letterSpacing: 2)),
          ),
        ),
      );
}
