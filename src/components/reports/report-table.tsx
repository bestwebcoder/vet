import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** §8.5's table presentation — first real use of the shadcn Table component in this app. */
export function ReportTable({
  columns,
  rows,
  emptyMessage = "No data for this range.",
}: {
  columns: string[];
  rows: (string | number)[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            {row.map((cell, cellIndex) => (
              <TableCell key={cellIndex} data-numeric={typeof cell === "number" ? "" : undefined}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
