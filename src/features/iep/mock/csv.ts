/**
 * RFC 4180 CSV parsing: quoted fields, doubled quotes, embedded newlines, and CRLF or
 * LF row endings. The mock datasets are parsed with this rather than a split on "\n"
 * so a file saved on Windows still loads.
 */

export interface CsvTable {
  header: string[];
  rows: Record<string, string>[];
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  // Skip a UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
  }
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      pushField();
      pushRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

export function parseCsv(text: string): CsvTable {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { header: [], rows: [] };
  }
  const header = rows[0].map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') {
      continue;
    }
    const record: Record<string, string> = {};
    header.forEach((name, c) => {
      record[name] = cells[c] ?? '';
    });
    out.push(record);
  }
  return { header, rows: out };
}

/** A blank cell is absent, never zero. */
export function numberOrNull(cell: string | undefined): number | null {
  if (cell === undefined) {
    return null;
  }
  const trimmed = cell.trim();
  if (trimmed === '') {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Yes/No/True/False cells; blank stays null because missing and false differ. */
export function booleanOrNull(cell: string | undefined): boolean | null {
  if (cell === undefined) {
    return null;
  }
  const t = cell.trim().toLowerCase();
  if (t === '') {
    return null;
  }
  if (t === 'yes' || t === 'true' || t === '1') {
    return true;
  }
  if (t === 'no' || t === 'false' || t === '0') {
    return false;
  }
  return null;
}
