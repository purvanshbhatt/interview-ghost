// scripts/build-icon.js — extract the largest set of PNG icons from a real
// Edge install and pack a multi-resolution .ico that includes 256x256.
//
// electron-builder requires at least one 256x256 image, so we keep the
// Edge PE resources' hidden 0x0 PNG and also retain the 64/48/40/32 sizes
// for crisp small-size rendering in Explorer / Task Manager.
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');
const { NtExecutable, NtExecutableResource } = ResEdit;

const sources = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\EdgeUpdate\\MicrosoftEdgeUpdate.exe',
  'C:\\Program Files\\Microsoft\\EdgeUpdate\\MicrosoftEdgeUpdate.exe',
];

let extracted = null;
for (const src of sources) {
  if (!fs.existsSync(src)) continue;
  try {
    const exe = NtExecutable.from(fs.readFileSync(src), { ignoreCert: true });
    const res = NtExecutableResource.from(exe);
    const group = res.entries.find((e) => e.type === 14);
    if (!group) continue;
    const raw = group.bin instanceof Buffer
      ? group.bin.buffer.slice(group.bin.byteOffset, group.bin.byteOffset + group.bin.byteLength)
      : group.bin;
    const dv = new DataView(raw);
    const count = dv.getUint16(4, true);
    const candidates = [];
    for (let i = 0; i < count; i++) {
      const off = 6 + i * 14;
      candidates.push({
        width: dv.getUint8(off),
        height: dv.getUint8(off + 1),
        bitCount: dv.getUint16(off + 6, true),
        id: dv.getUint16(off + 12, true),
      });
    }
    // Edge stores the big one as 0x0 (PNG-encoded). electron-builder accepts
    // PNG payloads directly in the .ico. Prefer the PNG-encoded (w=h=0)
    // large entry, then fall back to the 256 if present.
    const ordered = candidates
      .filter((c) => c.bitCount >= 32 && (c.width === 0 || (c.width >= 16 && c.width <= 256)))
      .sort((a, b) => {
        // 0 (PNG, often the 256) first, then descending size.
        if ((a.width === 0) !== (b.width === 0)) return a.width === 0 ? -1 : 1;
        return b.width - a.width;
      })
      .slice(0, 6);
    const payloads = [];
    for (const meta of ordered) {
      const entry = res.entries.find((e) => e.type === 3 && e.id === meta.id);
      if (!entry) continue;
      const ab = entry.bin instanceof Buffer
        ? entry.bin.buffer.slice(entry.bin.byteOffset, entry.bin.byteOffset + entry.bin.byteLength)
        : entry.bin;
      payloads.push({ data: Buffer.from(ab), meta });
    }
    if (payloads.length) {
      extracted = payloads;
      console.log('Using', src);
      for (const p of payloads) {
        console.log(' ', p.meta.width + 'x' + p.meta.height, p.meta.bitCount + 'bpp', p.data.length, 'bytes');
      }
      break;
    }
  } catch (e) {
    console.log('skip', src, e.message);
  }
}

if (!extracted) { console.error('no icon extracted'); process.exit(1); }

// Build a real .ico file: ICONDIR + ICONDIRENTRY[] + image payloads.
const ICONDIR = Buffer.alloc(6);
ICONDIR.writeUInt16LE(0, 0);             // reserved
ICONDIR.writeUInt16LE(1, 2);             // type 1 = icon
ICONDIR.writeUInt16LE(extracted.length, 4);

const entrySize = 16;
const headerSize = 6 + entrySize * extracted.length;
let offset = headerSize;

const entries = [];
for (const { data, meta } of extracted) {
  const e = Buffer.alloc(entrySize);
  e.writeUInt8(meta.width === 0 ? 0 : meta.width, 0);
  e.writeUInt8(meta.height === 0 ? 0 : meta.height, 1);
  e.writeUInt8(0, 2);                                    // color count
  e.writeUInt8(0, 3);                                    // reserved
  e.writeUInt16LE(meta.bitCount, 4);
  e.writeUInt32LE(data.length, 6);
  e.writeUInt32LE(offset, 10);
  offset += data.length;
  entries.push(e);
}

const out = Buffer.concat([ICONDIR, ...entries, ...extracted.map((p) => p.data)]);
const dest = path.join('build-resources', 'icon.ico');
fs.writeFileSync(dest, out);
console.log('wrote', dest, out.length, 'bytes');