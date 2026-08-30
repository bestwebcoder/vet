import { deflateRawSync } from "node:zlib";

/**
 * A minimal ZIP writer.
 *
 * Written rather than installed because Node already ships the hard part —
 * `zlib` does DEFLATE — and the container around it is a few hundred bytes of
 * header per file. A dependency here would be one more thing to keep current
 * in a system whose whole job is holding clinical records safely.
 *
 * Scope is deliberately narrow: no ZIP64, no encryption, no streaming. It
 * builds one archive in memory and returns it, which is right for a practice
 * snapshot (megabytes) and wrong for anything approaching the 4 GB where ZIP64
 * becomes necessary — {@link createZip} refuses rather than emitting an
 * archive that silently truncates.
 */

export type ZipEntry = {
  /** Path inside the archive, forward-slashed. */
  name: string;
  data: Uint8Array;
};

/** ZIP predates unsigned 32-bit sizes being generous. Past this it needs ZIP64. */
const MAX_ARCHIVE_BYTES = 0xffffffff;

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS packed date and time, which is what a ZIP entry stores.
 *
 * Two-second resolution and no timezone — that is the format, not an
 * oversight. The archive's real timestamp lives in manifest.json, where it is
 * an ISO instant; this only exists so a file manager shows something sensible.
 */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());

  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** Bit 11 tells the reader the name is UTF-8 rather than the legacy code page. */
const UTF8_NAME_FLAG = 0x0800;
const DEFLATED = 8;
const VERSION_NEEDED = 20;

export function createZip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const { time, date } = dosDateTime(when);
  const encoder = new TextEncoder();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data);

    // A tiny or already-compressed file can deflate larger than it started.
    // Storing it uncompressed is both smaller and what every writer does.
    const stored = compressed.length >= entry.data.length;
    const body = stored ? entry.data : new Uint8Array(compressed);
    const method = stored ? 0 : DEFLATED;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, VERSION_NEEDED, true);
    local.setUint16(6, UTF8_NAME_FLAG, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    locals.push(new Uint8Array(local.buffer), name, body);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    // Upper byte 3 = Unix, so permissions in the external attributes are read.
    central.setUint16(4, (3 << 8) | VERSION_NEEDED, true);
    central.setUint16(6, VERSION_NEEDED, true);
    central.setUint16(8, UTF8_NAME_FLAG, true);
    central.setUint16(10, method, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    // 0o100644 in the high 16 bits: a regular file, readable by everyone.
    central.setUint32(38, 0o100644 << 16, true);
    central.setUint32(42, offset, true);

    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + body.length;
    if (offset > MAX_ARCHIVE_BYTES) {
      throw new Error("Archive is too large for ZIP without ZIP64 support.");
    }
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);

  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }

  return archive;
}
