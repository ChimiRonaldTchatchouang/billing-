import { defineConfig } from '@playwright/test';

/**
 * Parcours de bout en bout : l'API (port 3100) et le web (port 5180) démarrent sur une base de
 * test préparée par e2e/preparer-base.mjs (organisation de démonstration).
 */
const API = 'http://localhost:3100';
const WEB = 'http://localhost:5180';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } }
      : {}),
  },
  webServer: [
    {
      command:
        'node e2e/preparer-base.mjs && node --env-file-if-exists=../api/.env ../api/dist/main.js',
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '3100',
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/caisse_e2e',
        DIRECT_URL:
          process.env.E2E_DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/caisse_e2e',
        CORS_ORIGINS: WEB,
        JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789',
        PDF_LINK_SECRET: 'e2e-pdf-secret-e2e-pdf-secret-0123456789',
        THROTTLE_AUTH_LIMIT: '1000',
      },
    },
    {
      command: 'pnpm exec vite --port 5180 --strictPort',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: API },
    },
  ],
});
