import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Quando true: sem starfield, sem animações contínuas, durações reduzidas.
final reduceMotionProvider = StateProvider<bool>((ref) => false);
