export type CsvColumn<T> = {
  label: string;
  accessor: keyof T | ((row: T) => unknown);
  formatter?: (value: unknown, row: T) => string;
};

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
}

function escapeCsvCell(value: string): string {
  const mustQuote =
    value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r");

  if (!mustQuote) {
    return value;
  }

  const escapedValue = value.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

export function exportToCsv<T extends object>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string,
): void {
  const headerRow = columns.map((column) => escapeCsvCell(column.label)).join(",");

  const dataRows = data.map((row) => {
    const cells = columns.map((column) => {
      const rawValue =
        typeof column.accessor === "function" ? column.accessor(row) : row[column.accessor];
      const formattedValue = column.formatter
        ? column.formatter(rawValue, row)
        : stringifyValue(rawValue);

      return escapeCsvCell(formattedValue);
    });

    return cells.join(",");
  });

  const csvString = [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
