/**
 * Draws a `ReportModel` with pdf-lib. Pure JavaScript, so the same renderer runs on the
 * device and in the Node sample-report tool.
 *
 * One cursor, owned by the sheet. Every block goes through `ensure(height)`, the only
 * function allowed to start a page. Label strips are counted inside block heights. The
 * footer is drawn when a page closes, outside content flow.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import { ReportGoal, ReportModel } from './pdfReportModel';
import { humanDay } from '../application/reportingPeriod';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const FOOTER_BAND = 30;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex('#17222F');
const MUTED = hex('#6B7889');
const BLUE = hex('#1F6BDB');
const GREEN = hex('#178C4F');
const AMBER = hex('#EB9117');
const RULE = hex('#D9E0E8');
const BAND = hex('#F5F7FC');

const SIZE = {
  title: 24,
  goalTitle: 15,
  heading: 12,
  subheading: 10.5,
  body: 10,
  cell: 9.5,
  level: 7.5,
  small: 8,
};

class Sheet {
  private page!: PDFPage;
  private y = 0;
  private pageNumber = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly model: ReportModel,
  ) {
    this.startPage();
  }

  private startPage(): void {
    if (this.pageNumber > 0) {
      this.drawFooter();
    }
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageNumber += 1;
    this.y = PAGE_H - MARGIN;
  }

  private get floor(): number {
    return MARGIN + FOOTER_BAND;
  }

  /** The only function that may begin a new page. */
  ensure(height: number): void {
    if (this.y - height < this.floor) {
      this.startPage();
    }
  }

  private drawFooter(): void {
    const text = `${this.model.student}  ·  ${this.model.reportingPeriod}  ·  Page ${this.pageNumber}`;
    this.page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_BAND - 6 }, end: { x: PAGE_W - MARGIN, y: MARGIN + FOOTER_BAND - 6 }, thickness: 0.5, color: RULE });
    this.page.drawText(text, { x: MARGIN, y: MARGIN + 6, size: SIZE.small, font: this.regular, color: MUTED });
  }

  finish(): void {
    this.drawFooter();
  }

  space(h: number): void {
    this.y -= h;
  }

  private width(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  /** Greedy word wrap; returns the lines. */
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (this.width(candidate, font, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current.length > 0) {
          lines.push(current);
        }
        current = word;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [''];
  }

  private clamp(text: string, font: PDFFont, size: number, maxWidth: number): string {
    if (this.width(text, font, size) <= maxWidth) {
      return text;
    }
    let t = text;
    while (t.length > 1 && this.width(`${t}…`, font, size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: RGB; width?: number; x?: number; lineHeight?: number } = {}): void {
    const size = opts.size ?? SIZE.body;
    const font = opts.bold ? this.bold : this.regular;
    const lh = opts.lineHeight ?? size * 1.35;
    const lines = this.wrap(text, font, size, opts.width ?? CONTENT_W);
    for (const line of lines) {
      this.ensure(lh);
      this.page.drawText(line, { x: opts.x ?? MARGIN, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
  }

  rule(): void {
    this.ensure(8);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 4 }, end: { x: PAGE_W - MARGIN, y: this.y - 4 }, thickness: 0.5, color: RULE });
    this.y -= 8;
  }

  /** Name left, target right; single line each. */
  planRow(name: string, target: string, note: string | null): void {
    const size = SIZE.body;
    const rowH = size * 1.5;
    const noteH = note ? SIZE.small * 1.5 : 0;
    this.ensure(rowH + noteH);
    const targetW = this.width(target, this.bold, size);
    this.page.drawText(this.clamp(name, this.regular, size, CONTENT_W - targetW - 12), { x: MARGIN, y: this.y - size, size, font: this.regular, color: INK });
    this.page.drawText(target, { x: PAGE_W - MARGIN - targetW, y: this.y - size, size, font: this.bold, color: BLUE });
    this.y -= rowH;
    if (note) {
      this.page.drawText(note, { x: MARGIN, y: this.y - SIZE.small, size: SIZE.small, font: this.regular, color: MUTED });
      this.y -= noteH;
    }
  }

  levelLabel(text: string): void {
    this.ensure(SIZE.level * 2.2);
    this.page.drawText(text, { x: MARGIN, y: this.y - SIZE.level, size: SIZE.level, font: this.bold, color: MUTED });
    this.y -= SIZE.level * 2.2;
  }

  table(columns: Array<{ title: string; width: number; align?: 'left' | 'right' }>, rows: string[][]): void {
    const rowH = 20;
    const size = SIZE.cell;
    const drawRow = (cells: string[], band: boolean, header: boolean) => {
      this.ensure(rowH);
      if (band) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - rowH, width: CONTENT_W, height: rowH, color: BAND });
      }
      let x = MARGIN;
      columns.forEach((col, i) => {
        const font = header ? this.bold : this.regular;
        const color = header ? MUTED : INK;
        const text = this.clamp(cells[i] ?? '', font, size, col.width - 8);
        const tx = col.align === 'right' ? x + col.width - 4 - this.width(text, font, size) : x + 4;
        this.page.drawText(text, { x: tx, y: this.y - rowH + (rowH - size) / 2 + 1, size, font, color });
        x += col.width;
      });
      this.y -= rowH;
    };
    drawRow(columns.map(c => c.title), false, true);
    rows.forEach((row, i) => drawRow(row, i % 2 === 0, false));
  }

  chart(goal: NonNullable<ReportGoal['chart']>): void {
    const blockH = 150;
    const leftGutter = 38;
    const bottomStrip = 18;
    const nameStrip = 14;
    this.ensure(blockH + nameStrip + 8);
    // Axis name above the plot.
    this.page.drawText(goal.yAxisName, { x: MARGIN, y: this.y - SIZE.small, size: SIZE.small, font: this.regular, color: MUTED });
    this.y -= nameStrip;

    const top = this.y;
    const plotX = MARGIN + leftGutter;
    const plotW = CONTENT_W - leftGutter;
    const plotH = blockH - bottomStrip;
    const plotBottom = top - plotH;
    const maxValue = Math.max(goal.target ?? 0, ...goal.points.map(p => p.value), 0);
    const ceiling = niceCeiling(maxValue);
    const yFor = (v: number) => plotBottom + (Math.min(v, ceiling) / ceiling) * plotH;
    const xFor = (i: number) => (goal.points.length === 1 ? plotX + plotW / 2 : plotX + (i / (goal.points.length - 1)) * plotW);

    for (const g of [0, ceiling / 2, ceiling]) {
      const gy = yFor(g);
      this.page.drawLine({ start: { x: plotX, y: gy }, end: { x: plotX + plotW, y: gy }, thickness: 0.5, color: RULE });
      const label = formatAxis(g);
      this.page.drawText(label, { x: plotX - 6 - this.width(label, this.regular, SIZE.small), y: gy - SIZE.small / 3, size: SIZE.small, font: this.regular, color: MUTED });
    }
    if (goal.target !== null) {
      const ty = yFor(goal.target);
      this.page.drawLine({ start: { x: plotX, y: ty }, end: { x: plotX + plotW, y: ty }, thickness: 1.5, color: AMBER, dashArray: [6, 5] });
      const label = `Target ${formatAxis(goal.target)}`;
      this.page.drawText(label, { x: plotX + plotW - this.width(label, this.bold, SIZE.small), y: ty + 3, size: SIZE.small, font: this.bold, color: AMBER });
    }
    for (let i = 1; i < goal.points.length; i += 1) {
      this.page.drawLine({
        start: { x: xFor(i - 1), y: yFor(goal.points[i - 1].value) },
        end: { x: xFor(i), y: yFor(goal.points[i].value) },
        thickness: 2,
        color: BLUE,
      });
    }
    goal.points.forEach((p, i) => {
      this.page.drawCircle({ x: xFor(i), y: yFor(p.value), size: 3.2, color: p.met ? GREEN : BLUE });
    });
    const first = humanDay(goal.points[0].dateMs);
    const last = humanDay(goal.points[goal.points.length - 1].dateMs);
    this.page.drawText(first, { x: plotX, y: plotBottom - bottomStrip + 4, size: SIZE.small, font: this.regular, color: MUTED });
    this.page.drawText(last, { x: plotX + plotW - this.width(last, this.regular, SIZE.small), y: plotBottom - bottomStrip + 4, size: SIZE.small, font: this.regular, color: MUTED });
    this.y = top - blockH - 8;
  }

  goalHeading(goal: ReportGoal): void {
    // Orphan control: the heading travels with the statement and first rows beneath it.
    this.ensure(150);
    this.paragraph(`Goal ${goal.number}: ${goal.title}`, { size: SIZE.goalTitle, bold: true });
  }
}

/** Rounds up to 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceCeiling(maxValue: number): number {
  if (!(maxValue > 0)) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(maxValue));
  const base = Math.pow(10, exponent);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (maxValue <= m * base) {
      return m * base;
    }
  }
  return 10 * base;
}

function formatAxis(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

export async function renderIepReport(model: ReportModel): Promise<Uint8Array> {
  const doc = await buildIepReportDocument(model);
  return doc.save();
}

/** Base64 output for react-native-fs, which cannot write a Uint8Array directly. */
export async function renderIepReportBase64(model: ReportModel): Promise<string> {
  const doc = await buildIepReportDocument(model);
  return doc.saveAsBase64();
}

/** Characters the standard Helvetica (WinAnsi) font can draw, beyond ASCII and Latin-1. */
const WINANSI_EXTRAS = new Set('\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178');
const SYMBOL_FALLBACK: Record<string, string> = {
  '\u2265': '>=',
  '\u2264': '<=',
  '\u2260': '!=',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2212': '-',
  '\u2713': 'yes',
  '\u2714': 'yes',
  '\u2717': 'no',
  '\u00D7': 'x',
  // Stroked letters have no combining accent to strip.
  '\u0141': 'L',
  '\u0142': 'l',
  '\u0110': 'D',
  '\u0111': 'd',
  '\u0126': 'H',
  '\u0127': 'h',
  '\u0131': 'i',
  '\u0166': 'T',
  '\u0167': 't',
};

/**
 * pdf-lib throws on any code point the standard fonts cannot encode. Names and goal
 * statements are free text, so every string is made drawable before it reaches a page.
 */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRAS.has(ch)) {
      out += ch;
    } else if (SYMBOL_FALLBACK[ch] !== undefined) {
      out += SYMBOL_FALLBACK[ch];
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += ' ';
    } else {
      // Decompose accented letters to their base letter; drop what is left.
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const baseCode = base.codePointAt(0) ?? 0;
      out += base.length > 0 && baseCode >= 0x20 && baseCode <= 0xff ? base : '?';
    }
  }
  return out;
}

function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return toWinAnsi(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDeep) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDeep(v);
    }
    return out as T;
  }
  return value;
}

export async function buildIepReportDocument(rawModel: ReportModel): Promise<PDFDocument> {
  const model = sanitizeDeep(rawModel);
  const doc = await PDFDocument.create();
  doc.setTitle(model.title);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(doc, regular, bold, model);

  // Title block
  sheet.paragraph(model.title, { size: SIZE.title, bold: true });
  sheet.space(4);
  sheet.paragraph(`Student: ${model.student}`, { size: SIZE.body, color: BLUE, bold: true });
  sheet.paragraph(`Reporting period: ${model.reportingPeriod}`, { size: SIZE.body, color: MUTED });
  sheet.paragraph(`Generated: ${model.generatedOn}`, { size: SIZE.body, color: MUTED });
  if (model.syntheticNote) {
    sheet.space(2);
    sheet.paragraph(model.syntheticNote, { size: SIZE.body, bold: true });
  }
  sheet.space(10);

  // Goals at a glance
  sheet.paragraph('Goals at a glance', { size: SIZE.heading, bold: true });
  sheet.space(4);
  sheet.table(
    [
      { title: '#', width: 22 },
      { title: 'Goal', width: 250 },
      { title: 'Status', width: 96 },
      { title: 'Attainment', width: 74, align: 'right' },
      { title: 'Sessions met', width: 74, align: 'right' },
    ],
    model.goals.map(g => [String(g.number), g.title, g.status, g.attainment, g.sessionsMet]),
  );
  sheet.space(16);

  for (const goal of model.goals) {
    sheet.goalHeading(goal);
    sheet.paragraph(goal.statement, { size: SIZE.body, color: MUTED });
    sheet.space(6);
    sheet.paragraph(`${goal.attainment}  ·  ${goal.status}`, { size: SIZE.subheading, bold: true, color: goal.attainment === '100%' ? GREEN : INK });
    if (goal.attainmentCaption) {
      sheet.paragraph(goal.attainmentCaption, { size: SIZE.small, color: MUTED });
    }
    if (goal.unavailableReason) {
      sheet.paragraph(goal.unavailableReason, { size: SIZE.small, color: MUTED });
    }
    sheet.space(8);

    sheet.paragraph('How this goal is measured', { size: SIZE.subheading, bold: true });
    sheet.space(2);
    for (const level of goal.levels) {
      sheet.levelLabel(level.label);
      for (const row of level.rows) {
        sheet.planRow(row.name, row.target, row.note);
      }
      sheet.space(4);
    }

    if (goal.chart) {
      sheet.paragraph('Progress over time', { size: SIZE.subheading, bold: true });
      sheet.space(2);
      sheet.chart(goal.chart);
    }

    sheet.paragraph('Sessions in this period', { size: SIZE.subheading, bold: true });
    sheet.space(4);
    if (goal.sessions.length === 0) {
      sheet.paragraph('No tracked sessions in this reporting period.', { size: SIZE.body, color: MUTED });
    } else {
      sheet.table(
        [
          { title: 'Date', width: 104 },
          { title: 'Result', width: 130 },
          { title: 'Target', width: 130 },
          { title: 'Met', width: 72 },
        ],
        goal.sessions.map(s => [s.date, s.result, s.target, s.met]),
      );
    }
    sheet.space(6);
    sheet.paragraph(goal.trendSentence, { size: SIZE.body });
    if (goal.aiNote) {
      sheet.space(2);
      sheet.paragraph(goal.aiNote, { size: SIZE.small, color: MUTED });
    }
    sheet.space(8);
    sheet.rule();
    sheet.space(10);
  }

  sheet.finish();
  return doc;
}

export function pdfFileName(generatedOnMs: number): string {
  const d = new Date(generatedOnMs);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `IEP-progress-report-${day}.pdf`;
}
