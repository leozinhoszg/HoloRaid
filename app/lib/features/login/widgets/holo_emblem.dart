import 'package:flutter/material.dart';
import '../login_theme.dart';

class HoloEmblem extends StatelessWidget {
  const HoloEmblem({super.key, this.size = 112});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        boxShadow: [BoxShadow(color: Color.fromRGBO(140, 150, 255, 0.35), blurRadius: 48, spreadRadius: 4)],
      ),
      child: Image.asset(
        'assets/emblem.png',
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => _fallback(),
      ),
    );
  }

  Widget _fallback() => Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [LoginPalette.indigoDeep, Color(0x00000000)]),
        ),
        alignment: Alignment.center,
        child: Text('H', style: TextStyle(fontSize: size * 0.5, fontWeight: FontWeight.w800, color: Colors.white)),
      );
}
