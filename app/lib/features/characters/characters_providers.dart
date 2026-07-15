import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import 'character_model.dart';
import 'characters_repository.dart';

final charactersRepositoryProvider = Provider<CharactersRepository>((ref) => CharactersRepository(ref.watch(apiClientProvider)));

final charactersProvider = FutureProvider<List<Character>>((ref) => ref.watch(charactersRepositoryProvider).list());

final characterProvider = FutureProvider.family<Character, int>((ref, id) => ref.watch(charactersRepositoryProvider).get(id));
