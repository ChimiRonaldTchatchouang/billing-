import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('applique les valeurs par défaut et découpe CORS_ORIGINS', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      CORS_ORIGINS: 'https://caisse.exemple.cm, https://recette.exemple.cm',
    });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['https://caisse.exemple.cm', 'https://recette.exemple.cm']);
  });

  it('refuse une configuration sans base de données, avec un message en français', () => {
    expect(() => loadEnv({})).toThrow(/Configuration invalide[\s\S]*DATABASE_URL/);
  });
});
