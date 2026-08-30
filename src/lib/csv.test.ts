import { describe, expect, it } from "vitest";

import { CsvParseError, parseCsv, rowsToCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { columns, rows } = parseCsv("full_name,phone\nRahim Uddin,01712345678\n");

    expect(columns).toEqual(["full_name", "phone"]);
    expect(rows).toEqual([{ full_name: "Rahim Uddin", phone: "01712345678" }]);
  });

  it("folds header spelling so nobody has to guess", () => {
    expect(parseCsv("Full Name,PHONE\nA,1\n").columns).toEqual(["full_name", "phone"]);
  });

  it("survives what Excel actually saves", () => {
    // Byte order mark, CRLF endings, a quoted comma and a doubled quote.
    const file = '﻿name,notes\r\n"Bagha, the cat","said ""hello"""\r\n';

    expect(parseCsv(file).rows).toEqual([{ name: "Bagha, the cat", notes: 'said "hello"' }]);
  });

  it("keeps a newline inside a quoted value", () => {
    expect(parseCsv('name,notes\nBagha,"line one\nline two"\n').rows[0].notes).toBe("line one\nline two");
  });

  it("ignores blank lines rather than importing empty rows", () => {
    expect(parseCsv("name\nA\n\n,\nB\n").rows).toEqual([{ name: "A" }, { name: "B" }]);
  });

  it("fills in a short row instead of shifting the columns along", () => {
    expect(parseCsv("a,b,c\n1,2\n").rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("refuses a file whose quotes never close", () => {
    expect(() => parseCsv('name\n"unterminated\n')).toThrow(CsvParseError);
  });

  it("refuses duplicate and blank headings", () => {
    expect(() => parseCsv("name,name\n1,2\n")).toThrow(/appears twice/);
    expect(() => parseCsv("name,,city\n1,2,3\n")).toThrow(/no heading/);
  });
});

describe("rowsToCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [{ name: 'Bagha, "the" cat', notes: "line one\nline two", weight: 4 }];
    const parsed = parseCsv(rowsToCsv(["name", "notes", "weight"], rows));

    expect(parsed.rows).toEqual([{ name: 'Bagha, "the" cat', notes: "line one\nline two", weight: "4" }]);
  });

  it("writes a nested value as json rather than [object Object]", () => {
    const csv = rowsToCsv(["metadata"], [{ metadata: { from: null, to: 3 } }]);

    expect(csv).toContain('"{""from"":null,""to"":3}"');
  });

  it("writes null and undefined as empty, not as the word null", () => {
    expect(rowsToCsv(["a", "b"], [{ a: null, b: undefined }])).toBe("a,b\n,\n");
  });
});
