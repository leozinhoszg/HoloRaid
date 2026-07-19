import 'package:flutter/material.dart';
import 'holo_palette.dart';

class HoloDropdownItem<T> {
  const HoloDropdownItem(this.value, this.label);
  final T value;
  final String label;
}

/// Dropdown holográfico: campo glass (reusa o InputDecoration do tema) que abre
/// um menu arredondado com borda/glow; item selecionado em azul + check.
/// `onChanged == null` desabilita o campo.
class HoloDropdown<T> extends StatelessWidget {
  const HoloDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final String label;
  final T? value;
  final List<HoloDropdownItem<T>> items;
  final ValueChanged<T?>? onChanged;

  @override
  Widget build(BuildContext context) {
    final enabled = onChanged != null;
    final selected = items.where((i) => i.value == value).cast<HoloDropdownItem<T>?>().firstWhere((_) => true, orElse: () => null);

    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      return MenuAnchor(
        crossAxisUnconstrained: false,
        style: MenuStyle(
          backgroundColor: const WidgetStatePropertyAll(Color(0xF2101430)),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          elevation: const WidgetStatePropertyAll(10),
          padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 6)),
          minimumSize: WidgetStatePropertyAll(Size(w, 0)),
          maximumSize: WidgetStatePropertyAll(Size(w, 340)),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: HoloPalette.glassBorderStrong),
          )),
        ),
        builder: (context, controller, child) {
          return InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: !enabled ? null : () => controller.isOpen ? controller.close() : controller.open(),
            child: InputDecorator(
              isEmpty: selected == null,
              isFocused: controller.isOpen,
              decoration: InputDecoration(
                labelText: label,
                enabled: enabled,
                suffixIcon: Icon(controller.isOpen ? Icons.expand_less : Icons.expand_more,
                    color: enabled ? HoloPalette.dim : HoloPalette.faint),
              ),
              child: Text(
                selected?.label ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontFamily: 'Jura', fontSize: 15, color: enabled ? HoloPalette.ink : HoloPalette.faint),
              ),
            ),
          );
        },
        menuChildren: items.map((it) {
          final isSel = it.value == value;
          return MenuItemButton(
            onPressed: () => onChanged?.call(it.value),
            leadingIcon: Icon(Icons.check, size: 16, color: isSel ? HoloPalette.blue : Colors.transparent),
            style: ButtonStyle(
              minimumSize: WidgetStatePropertyAll(Size(w, 44)),
              padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 14)),
              backgroundColor: WidgetStatePropertyAll(isSel ? const Color(0x1A76C8FF) : Colors.transparent),
              overlayColor: const WidgetStatePropertyAll(Color(0x2276C8FF)),
              foregroundColor: WidgetStatePropertyAll(isSel ? HoloPalette.blue : HoloPalette.ink),
              textStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: 'Jura', fontSize: 15)),
              shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            ),
            child: Align(alignment: Alignment.centerLeft, child: Text(it.label)),
          );
        }).toList(),
      );
    });
  }
}
