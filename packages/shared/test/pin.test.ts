import { describe, expect, it } from 'vitest';
import { hacherPin, verifierPin } from '../src/index.js';

describe('PIN', () => {
  it('vérifie le bon PIN et refuse les autres', async () => {
    const h = await hacherPin('1234');
    expect(h).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifierPin('1234', h)).toBe(true);
    expect(await verifierPin('1235', h)).toBe(false);
    expect(await verifierPin('12a4', h)).toBe(false);
    expect(await verifierPin('1234', 'invalide')).toBe(false);
  });

  it('deux empreintes du même PIN diffèrent (sel aléatoire)', async () => {
    expect(await hacherPin('0000')).not.toBe(await hacherPin('0000'));
  });

  it('refuse un PIN qui n’a pas 4 chiffres', async () => {
    await expect(hacherPin('123')).rejects.toThrow('4 chiffres');
  });
});
