#!/usr/bin/env node
/**
 * Makes the event stream actually support the summary numbers.
 *
 * Node port of docs/iep-dashboard-agent-package/reference-source/tools/reconcile_mock_evidence.py.
 *
 * Overview and Details read the summary CSV; Evidence reads the events CSV. Where they
 * disagree the dashboard contradicts itself. The summary is treated as the source of
 * truth for a goal's headline metric, and that goal's own evidence is adjusted to match:
 *
 *   short  -> append events tagged to this goal alone, carrying the right signal
 *   excess -> drop this goal from the event's goal_ids_supported, leaving the event
 *             intact for the other goals that reference it
 *
 * Without --dry-run the standard events CSV in the data dir is rewritten in place.
 *
 *   node scripts/iep-reconcile-mock.js [--dry-run] [--data-dir docs/iep-dashboard-agent-package/mock-data]
 */
'use strict';

const path = require('path');
const audit = require('./lib/iepMockAudit');

function parseArgs(argv) {
  const opts = { dryRun: false, dataDir: audit.DEFAULT_DATA_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
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
      'usage: node scripts/iep-reconcile-mock.js [--dry-run] [--data-dir <path>]\n',
    );
    return 0;
  }
  const { lines } = audit.reconcileDataset({ dataDir: opts.dataDir, dryRun: opts.dryRun });
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

process.exitCode = main();
