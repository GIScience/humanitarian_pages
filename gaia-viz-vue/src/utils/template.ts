import { generateFilename } from "./filenameGenerator";

export const downloadIndicatorCSVTemplate = (
  columns: string[],
  pcodes: string[],
  pcodeColumnName: string,
  filename = "indicator_template",
  countryCode = "country",
): void => {
  // Header row: pcode column first, then the indicator columns
  const header = [pcodeColumnName, ...columns];

  // One row per pcode, with empty cells for each indicator column
  const rows = pcodes.map((pcode) => [pcode, ...columns.map(() => "")]);

  const csv = [header, ...rows]
    .map((row) => row.map(escapeCSVCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${generateFilename(filename, countryCode)}`;
  link.click();
  URL.revokeObjectURL(url);
};

// Wrap values containing commas, quotes, or newlines
const escapeCSVCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
