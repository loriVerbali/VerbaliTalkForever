/**
 * Minimal RFC 4180 CSV reader/writer shared by the IEP mock-data audit scripts.
 *
 * Reading: comma-delimited, double-quoted fields with doubled quotes for a literal
 * quote, CRLF or LF record terminators, and newlines inside quoted fields. A UTF-8
 * BOM is ignored. A trailing terminator does not create an empty record.
 *
 * Writing mirrors Python's csv.DictWriter defaults (QUOTE_MINIMAL, CRLF terminator)
 * so a file rewritten here is byte-identical to one rewritten by the Python tools.
 *
 * Node built-ins only; no dependencies.
 */
'use strict';

/**
 * Parses CSV text into an array of records (arrays of strings).
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsvRecords(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (quoted) {
    throw new Error('CSV: unterminated quoted field at end of input');
  }
  // Final record without a trailing terminator.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Parses CSV text into objects keyed by the header row, like Python's csv.DictReader.
 * Short rows are padded with '' and long rows are truncated to the header width.
 * @param {string} text
 * @returns {{headers: string[], rows: Record<string, string>[]}}
 */
function parseCsv(text) {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = records[0];
  const rows = [];
  for (let r = 1; r < records.length; r += 1) {
    const rec = records[r];
    // Python's csv.reader also yields an empty list for a blank line; DictReader skips it.
    if (rec.length === 1 && rec[0] === '') {
      continue;
    }
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = c < rec.length ? rec[c] : '';
    }
    rows.push(row);
  }
  return { headers, rows };
}

/** Quotes a field only when needed, as Python's csv QUOTE_MINIMAL does. */
function formatField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialises records to CSV text with CRLF terminators (Python csv default).
 * @param {string[]} headers
 * @param {Record<string, unknown>[]} rows
 * @returns {string}
 */
function stringifyCsv(headers, rows) {
  const lines = [headers.map(formatField).join(',')];
  for (const row of rows) {
    const fields = headers.map(h => formatField(row[h]));
    // Python writes a lone empty field as "" so the line is not read back as blank.
    if (fields.length === 1 && fields[0] === '') {
      fields[0] = '""';
    }
    lines.push(fields.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { parseCsv, parseCsvRecords, stringifyCsv };
