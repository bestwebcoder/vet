"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  label: string;
  name: string;
  defaultValue?: Date;
  errors?: string[];
  hint?: string;
  disabled?: boolean;
  /** Restricts selection, e.g. a date of birth cannot be in the future. */
  fromDate?: Date;
  toDate?: Date;
  /** For a step of a larger flow that needs the chosen date outside this component. */
  onSelect?: (date: Date | undefined) => void;
};

/**
 * Date entry for forms that submit as FormData to a server action.
 *
 * The visible control is a calendar; the value the server receives comes from
 * a hidden input holding an ISO date, so no screen has to hand-parse a
 * localised string.
 */
export function DatePicker({
  label,
  name,
  defaultValue,
  errors,
  hint,
  disabled,
  fromDate,
  toDate,
  onSelect,
}: DatePickerProps) {
  const [selected, setSelected] = useState<Date | undefined>(defaultValue);
  const [open, setOpen] = useState(false);

  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${name}-trigger`}>{label}</Label>

      <input type="hidden" name={name} value={selected ? format(selected, "yyyy-MM-dd") : ""} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={`${name}-trigger`}
              type="button"
              variant="outline"
              size="touch"
              disabled={disabled}
              aria-invalid={hasError || undefined}
              aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
              className={cn(
                "w-full justify-between font-normal",
                !selected && "text-muted-foreground",
                hasError && "border-destructive",
              )}
            >
              {selected ? format(selected, "d MMMM yyyy") : "Select a date"}
              <CalendarIcon aria-hidden />
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            disabled={[
              ...(fromDate ? [{ before: fromDate }] : []),
              ...(toDate ? [{ after: toDate }] : []),
            ]}
            onSelect={(date) => {
              setSelected(date);
              onSelect?.(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-destructive text-sm" role="alert">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
