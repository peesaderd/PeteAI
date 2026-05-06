import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/vision/**/*.test.js'],
    environment: 'node'
  }
});
