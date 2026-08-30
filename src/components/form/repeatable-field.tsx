"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * A list the person editing it can grow and shrink — a bullet point per row,
 * or a fee line per row.
 *
 * Posts one input per row under the same `name`, which arrives at the action
 * as a parallel array (`formData.getAll`). That is why removing a row splices
 * rather than blanking it: the server pairs two of these lists by index for
 * fee tiers, and a hole in one would shift the other.
 *
 * Rows are keyed by a counter rather than by array index, so removing the
 * middle row does not make React reuse its input for the row below and carry
 * the wrong text across.
 */

type Row = { id: number; value: string; second: string };

export function RepeatableField({
  label,
  name,
  hint,
  placeholder,
  /** A second input per row, for a value that qualifies the first. */
  secondName,
  secondPlaceholder,
  defaultValues = [],
  max = 12,
  addLabel = "Add another",
}: {
  label: string;
  name: string;
  hint?: string;
  placeholder?: string;
  secondName?: string;
  secondPlaceholder?: string;
  defaultValues?: { value: string; second?: string | null }[];
  max?: number;
  addLabel?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValues.length > 0
      ? defaultValues.map((entry, index) => ({ id: index, value: entry.value, second: entry.second ?? "" }))
      : [{ id: 0, value: "", second: "" }],
  );
  const [nextId, setNextId] = useState(rows.length);

  function addRow() {
    if (rows.length >= max) return;
    setRows((current) => [...current, { id: nextId, value: "", second: "" }]);
    setNextId((id) => id + 1);
  }

  function removeRow(id: number) {
    // Never down to nothing: an empty list with no input is a dead end with no
    // way to start typing again.
    setRows((current) => (current.length === 1 ? [{ id, value: "", second: "" }] : current.filter((row) => row.id !== id)));
  }

  function update(id: number, key: "value" | "second", next: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: next } : row)));
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>

      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              name={name}
              value={row.value}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => update(row.id, "value", event.target.value)}
            />

            {secondName ? (
              <Input
                name={secondName}
                value={row.second}
                placeholder={secondPlaceholder}
                aria-label={`${label} ${index + 1} — applies to`}
                className="max-w-[10rem]"
                onChange={(event) => update(row.id, "second", event.target.value)}
              />
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              onClick={() => removeRow(row.id)}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
      </div>

      {rows.length < max ? (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={addRow}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      ) : null}

      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}
