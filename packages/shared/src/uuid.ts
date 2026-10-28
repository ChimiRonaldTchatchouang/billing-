/** UUID version 7 : horodaté (ordre chronologique) et aléatoire, créé sur la caisse. */
export function uuidv7(maintenant: number = Date.now()): string {
  const octets = crypto.getRandomValues(new Uint8Array(16));
  let t = maintenant;
  for (let i = 5; i >= 0; i--) {
    octets[i] = t % 256;
    t = Math.floor(t / 256);
  }
  octets[6] = (octets[6]! & 0x0f) | 0x70;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const h = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
