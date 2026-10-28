import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uuidv7 } from '../src/index.js';

describe('uuidv7', () => {
  it('produit un UUID v7 valide et trié dans le temps', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(z.uuid({ version: 'v7' }).safeParse(a).success).toBe(true);
    expect(a < b).toBe(true);
    expect(uuidv7()).not.toBe(uuidv7());
  });
});
