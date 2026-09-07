import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/frontend-core.js', 'src/currencies.js', 'src/worker-core.js', 'src/errors.js'],
      exclude: ['src/**/*.test.{js,jsx}'],
    },
  },
});
