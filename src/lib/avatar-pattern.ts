/** Stable local identicon: no remote service, random values, or dependency on the display name. */
export function avatarPattern(identity: string): {
  background: string;
  cells: { x: number; y: number }[];
} {
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let lane = 0; lane < hashes.length; lane++) {
    let hash = hashes[lane];
    for (let index = 0; index < identity.length; index++) {
      hash = Math.imul(hash ^ identity.charCodeAt(index), 0x01000193);
      hash ^= hash >>> 13;
    }
    hashes[lane] = hash >>> 0;
  }
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 4; x++) {
      if ((hashes[y % 3] >>> (y * 4 + x)) & 1) {
        cells.push({ x: x + 1, y: y + 1 });
        if (x !== 3) cells.push({ x: 7 - x, y: y + 1 });
      }
    }
  }
  // Keep the fallback visible even for a seed whose pattern bits are all zero.
  if (!cells.length) cells.push({ x: 4, y: 4 });
  return { background: `hsl(${hashes[3] % 360} 55% ${32 + (hashes[0] % 10)}%)`, cells };
}
