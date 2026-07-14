import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Só arquivos TypeScript de teste — evita casar artefatos .js compilados por engano.
    include: ['tests/**/*.test.ts'],
  },
});
