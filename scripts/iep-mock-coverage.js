#!/usr/bin/env node
/**
 * Reports which dashboard states a mock dataset actually exercises.
 *
 * Node port of docs/iep-dashboard-agent-package/reference-source/tools/mock_coverage_report.py.
 * Same rules, same printed output. Two reports:
 *
 *   Coverage    -- which states at least one goal produces. Reachability, not
 *                  correctness: it says a state can appear, not that it is right.
 *   Consistency -- whether the event stream supports the summary numbers. Overview and
 *                  Details read the summary; Evidence reads the events, so a mismatch
 *                  means the dashboard contradicts itself between sections.
 *
 * Exits non-zero when any goal is inconsistent, so it can gate a build.
 *
 *   node scripts/iep-mock-coverage.js [--weeks 12] [--data-dir docs/iep-dashboard-agent-package/mock-data]
 */
'use strict';

const path = require('path');
const audit = require('./lib/iepMockAudit');

function parseArgs(argv) {
  const opts = { weeks: audit.DEFAULT_WEEKS, dataDir: audit.DEFAULT_DATA_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--weeks') {
      const raw = argv[i + 1];
      if (raw === undefined || !/^[+-]?\d+$/.test(raw.trim())) {
        throw new Error(`--weeks expects an integer, got '${raw}'`);
      }
      opts.weeks = parseInt(raw, 10);
      i += 1;
    } else if (arg === '--data-dir') {
      if (argv[i + 1] === undefined) {
        throw new Error('--data-dir expects a path');
      }
      opts.dataDir = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else {
      throw new Error(`Unknown argument '${arg}'`);
    }
  }
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(
      'usage: node scripts/iep-mock-coverage.js [--weeks N] [--data-dir <path>]\n',
    );
    return 0;
  }

  const coverage = audit.coverageReport({ dataDir: opts.dataDir, weeks: opts.weeks });
  process.stdout.write(coverage.lines.join('\n') + '\n');

  const consistency = audit.consistencyReport({ dataDir: opts.dataDir });
  process.stdout.write(consistency.lines.join('\n') + '\n');
  return consistency.failures ? 1 : 0;
}

process.exitCode = main();
