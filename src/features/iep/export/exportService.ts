/**
 * Writes the CSV and PDF into a temporary folder and hands them to the system share
 * sheet. Both formats are generated from the same GoalProgress models the screens use.
 */

import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { GoalProgress } from '../application/goalProgress';
import { buildIepCsv, csvFileName } from './csvExport';
import { buildReportModel } from './pdfReportModel';
import { pdfFileName, renderIepReportBase64 } from './pdfRenderer';

export interface ExportRequest {
  student: string;
  reportingPeriodLabel: string;
  goals: readonly GoalProgress[];
  formats: { pdf: boolean; csv: boolean };
  generatedOnMs?: number;
}

export interface ExportedFile {
  path: string;
  name: string;
  mimeType: string;
}

const TEMP_DIR = `${RNFS.TemporaryDirectoryPath}/iep-export`.replace(/\/+$/, '');

export async function writeExportFiles(request: ExportRequest): Promise<ExportedFile[]> {
  const generatedOnMs = request.generatedOnMs ?? Date.now();
  if (!(await RNFS.exists(TEMP_DIR))) {
    await RNFS.mkdir(TEMP_DIR);
  }
  const files: ExportedFile[] = [];
  if (request.formats.csv) {
    const name = csvFileName(generatedOnMs);
    const path = `${TEMP_DIR}/${name}`;
    await RNFS.writeFile(path, buildIepCsv({ student: request.student, reportingPeriodLabel: request.reportingPeriodLabel, generatedOnMs, goals: request.goals }), 'utf8');
    files.push({ path, name, mimeType: 'text/csv' });
  }
  if (request.formats.pdf) {
    const name = pdfFileName(generatedOnMs);
    const path = `${TEMP_DIR}/${name}`;
    const model = buildReportModel({ student: request.student, reportingPeriod: request.reportingPeriodLabel, generatedOnMs, goals: request.goals });
    await RNFS.writeFile(path, await renderIepReportBase64(model), 'base64');
    files.push({ path, name, mimeType: 'application/pdf' });
  }
  return files;
}

/** Opens the share sheet. Google Drive is reached through it when installed. */
export async function shareExportFiles(files: readonly ExportedFile[], subject: string): Promise<void> {
  if (files.length === 0) {
    return;
  }
  await Share.open({
    title: subject,
    subject,
    urls: files.map(f => `file://${f.path}`),
    failOnCancel: false,
  });
}

export async function exportAndShare(request: ExportRequest): Promise<ExportedFile[]> {
  const files = await writeExportFiles(request);
  await shareExportFiles(files, 'IEP progress report');
  return files;
}
