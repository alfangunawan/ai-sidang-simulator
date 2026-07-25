import type { Turn } from "../types.js";

// RFC-4180 field escaping: quote fields containing a comma, quote, or newline,
// doubling any internal quotes.
function escapeField(field: string): string {
  return /[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function turnsToCsv(turns: Turn[]): string {
  const rows = turns.map((t, i) =>
    [String(i + 1), t.role === "examiner" ? "Penguji" : "Anda", t.content]
      .map(escapeField)
      .join(","),
  );
  return ["no,peran,isi", ...rows].join("\n");
}

// Triggers a browser download of the CSV text. Thin DOM glue — not unit-tested.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
