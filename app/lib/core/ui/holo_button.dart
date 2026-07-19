import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Botão CTA holográfico (gradiente + glow). Full-width por padrão.
class HoloButton extends StatelessWidget {
  const HoloButton({super.key, required this.label, required this.onPressed, this.loading = false});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return SizedBox(
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          boxShadow: enabled ? const [BoxShadow(color: Color(0x997E7BFF), blurRadius: 22, offset: Offset(0, 8))] : null,
        ),
        child: FilledButton(
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            backgroundColor: enabled ? HoloPalette.blue : const Color(0x33FFFFFF),
            foregroundColor: enabled ? const Color(0xFF0A0D1C) : HoloPalette.faint,
            disabledBackgroundColor: const Color(0x22FFFFFF),
            disabledForegroundColor: HoloPalette.faint,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: enabled ? onPressed : null,
          child: loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0A0D1C)))
              : Text(label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 14, letterSpacing: 2)),
        ),
      ),
    );
  }
}
