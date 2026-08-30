import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createZip } from "@/lib/zip";

/**
 * A ZIP writer is only correct if something other than itself can read what it
 * wrote, so these tests shell out to the system `unzip` rather than round-trip
 * through the same assumptions that produced the file.
 */

function writeArchive(archive: Uint8Array): string {
  const directory = mkdtempSync(join(tmpdir(), "tv-care-zip-"));
  const path = join(directory, "archive.zip");
  writeFileSync(path, archive);
  return path;
}

const encoder = new TextEncoder();

describe("createZip", () => {
  it("writes an archive unzip considers intact", () => {
    const archive = createZip([
      { name: "manifest.json", data: encoder.encode('{"format":"tv-care-snapshot/1"}\n') },
      { name: "json/clients.json", data: encoder.encode("[]\n") },
    ]);

    const output = execFileSync("unzip", ["-t", writeArchive(archive)], { encoding: "utf8" });

    expect(output).toContain("No errors detected");
  });

  it("round-trips content, including a payload large enough to deflate", () => {
    // Repetitive text compresses; the short entries above do not, so this is
    // the case that exercises the DEFLATE path rather than the stored one.
    const bulky = "the quick brown fox jumps over the lazy dog\n".repeat(2000);

    const path = writeArchive(
      createZip([
        { name: "notes.txt", data: encoder.encode(bulky) },
        { name: "nested/deep/empty.json", data: encoder.encode("[]") },
      ]),
    );

    const directory = mkdtempSync(join(tmpdir(), "tv-care-unzip-"));
    execFileSync("unzip", ["-q", path, "-d", directory]);

    expect(readFileSync(join(directory, "notes.txt"), "utf8")).toBe(bulky);
    expect(readFileSync(join(directory, "nested/deep/empty.json"), "utf8")).toBe("[]");
  });

  it("keeps a non-ascii file name readable", () => {
    // The practice is in Bangladesh; a Bengali file name has to survive, which
    // is what the UTF-8 flag on each entry is for.
    const path = writeArchive(createZip([{ name: "রিপোর্ট.txt", data: encoder.encode("hello") }]));

    const directory = mkdtempSync(join(tmpdir(), "tv-care-unzip-"));
    execFileSync("unzip", ["-q", path, "-d", directory]);

    // Read back off disk rather than out of `unzip -l`, whose own listing
    // mangles combining marks in a terminal. macOS stores names decomposed,
    // so both sides are normalised before comparing.
    const [name] = readdirSync(directory);

    expect(name.normalize("NFC")).toBe("রিপোর্ট.txt".normalize("NFC"));
    expect(readFileSync(join(directory, name), "utf8")).toBe("hello");
  });
});
