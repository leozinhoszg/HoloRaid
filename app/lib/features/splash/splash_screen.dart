import 'package:flutter/material.dart';
import '../../core/ui/holo_palette.dart';
import '../../core/ui/holo_wordmark.dart';

/// Tela de espera enquanto o app tenta restaurar a sessão no boot.
/// O fundo holográfico vem do HoloBackground global (MaterialApp.builder).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.transparent,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            HoloWordmark(size: 40),
            SizedBox(height: 28),
            SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(strokeWidth: 2, color: HoloPalette.blue),
            ),
          ],
        ),
      ),
    );
  }
}
