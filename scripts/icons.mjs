import { deflateSync } from "node:zlib";
// Small code-drawn PNGs: Chromium does not accept SVG manifest icons.
function chunk(type, data) {
  const name = Buffer.from(type),
    all = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of all) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, all, tail]);
}
function distance(x, y, ax, ay, bx, by) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
        ((bx - ax) ** 2 + (by - ay) ** 2),
    ),
  );
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}
export function iconPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = (x + (sx + 0.5) / 4) / size,
            py = (y + (sy + 0.5) / 4) / size;
          const dx = Math.max(Math.abs(px - 0.5) - 0.26, 0),
            dy = Math.max(Math.abs(py - 0.5) - 0.26, 0);
          if (Math.hypot(dx, dy) > 0.21) continue;
          const ring = Math.abs(Math.hypot(px - 0.5, py - 0.5) - 0.29) < 0.025;
          const hand =
            distance(px, py, 0.5, 0.5, 0.5, 0.29) < 0.022 ||
            distance(px, py, 0.5, 0.5, 0.68, 0.6) < 0.022;
          const dot = Math.hypot(px - 0.73, py - 0.23) < 0.065;
          const color = dot
            ? [109, 226, 240]
            : ring || hand
              ? [245, 247, 255]
              : [88, 73, 206];
          for (let c = 0; c < 3; c++) sums[c] += color[c];
          sums[3] += 255;
        }
      const at = y * (size * 4 + 1) + 1 + x * 4;
      const count = sums[3] / 255;
      for (let c = 0; c < 3; c++)
        raw[at + c] = count ? Math.round(sums[c] / count) : 0;
      raw[at + 3] = Math.round(sums[3] / 16);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
