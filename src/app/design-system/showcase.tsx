"use client";

import { CalendarClock, PawPrint } from "lucide-react";

import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { CardListSkeleton, LoadingState, TableSkeleton } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";

const SURFACE_TOKENS = [
  "background",
  "card",
  "muted",
  "secondary",
  "accent",
  "primary",
  "destructive",
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-12 px-4 py-10">
      <header className="grid gap-2">
        <h1>Design system</h1>
        <p className="text-muted-foreground">
          Phase 1 primitives. Every later screen composes these rather than restyling.
        </p>
      </header>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACE_TOKENS.map((token) => (
            <div key={token} className="grid gap-1.5">
              <div
                className="h-14 rounded-lg border"
                style={{ background: `var(--${token})` }}
                aria-hidden
              />
              <span className="text-muted-foreground text-xs">{token}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="bg-card grid gap-3 rounded-lg border p-5">
          <h1>Heading one</h1>
          <h2>Heading two</h2>
          <h3>Heading three</h3>
          <h4>Heading four</h4>
          <p>
            Body copy sets at a relaxed line height for reading clinical notes on a phone in
            poor light.
          </p>
          <p className="text-muted-foreground text-sm">Secondary copy for hints and captions.</p>
          <p data-numeric className="text-sm">
            Figures align in columns: 12.40 kg · 1,250.00 BDT · 08:30
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="touch">Touch, 44px</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <Card>
          <CardHeader>
            <CardTitle>Every form uses these</CardTitle>
            <CardDescription>
              Label, control, hint and error come from one component, so problems are reported
              the same way everywhere.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
              <Field label="Pet name" name="demo-name" placeholder="Laika" />
              <Field
                label="Mobile number"
                name="demo-phone"
                hint="For example 01712345678"
                defaultValue="017"
              />
              <Field
                label="Email"
                name="demo-email"
                defaultValue="not-an-email"
                errors={["Enter a valid email address"]}
              />

              <div className="grid gap-2">
                <Label htmlFor="demo-species">Species</Label>
                <Select>
                  <SelectTrigger id="demo-species" className="w-full">
                    <SelectValue placeholder="Select a species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                    <SelectItem value="rabbit">Rabbit</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  Options come from the database in real screens, never a hard-coded list.
                </p>
              </div>

              <DatePicker
                label="Date of birth"
                name="demo-dob"
                hint="Cannot be in the future"
                toDate={new Date()}
              />

              <SubmitButton>Save</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Discard this draft?</DialogTitle>
              <DialogDescription>
                Nothing has been saved yet. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Keep editing</Button>} />
              <DialogClose render={<Button variant="destructive">Discard</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Table">
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pet</TableHead>
                  <TableHead>Species</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Laika</TableCell>
                  <TableCell>Dog</TableCell>
                  <TableCell data-numeric className="text-right">
                    12.40 kg
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Mishti</TableCell>
                  <TableCell>Cat</TableCell>
                  <TableCell data-numeric className="text-right">
                    4.05 kg
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>

      <Section title="States">
        <div className="grid gap-4">
          <Card>
            <CardContent>
              <EmptyState
                icon={PawPrint}
                title="No pets yet"
                description="Add your pet to book appointments and see their records."
                action={
                  <Button size="touch" className="w-full">
                    Add a pet
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ErrorState
                action={
                  <Button variant="outline" size="touch" className="w-full">
                    Try again
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loading placeholders</CardTitle>
              <CardDescription>Shaped like the content, so layout does not jump.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <LoadingState />
              <CardListSkeleton count={2} />
              <TableSkeleton rows={3} columns={3} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <CalendarClock className="mr-2 inline size-4 align-[-2px]" aria-hidden />
                Actionable, not blank
              </CardTitle>
              <CardDescription>
                Dashboards answer one question: what needs attention today.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Section>
    </main>
  );
}
