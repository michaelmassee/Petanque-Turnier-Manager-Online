import { readFileSync } from 'node:fs';

const MINIMUM_PERCENTAGE = 60;
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const GROUPS = {
  Frontend: ['src/frontend-core.js', 'src/currencies.js'],
  Worker: ['src/worker-core.js', 'src/errors.js'],
};

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
// This baseline is intentionally versioned. Raising it requires a reviewed test
// improvement; lowering it would explicitly show up in the code review.
const baseline = JSON.parse(readFileSync('config/coverage-baseline.json', 'utf8'));
let failed = false;

for (const [group, files] of Object.entries(GROUPS)) {
  const entries = files.map((file) => {
    const entry = Object.entries(summary).find(([path]) => path.replaceAll('\\', '/').endsWith(`/${file}`));
    if (!entry) {
      throw new Error(`Coverage report does not contain ${file}.`);
    }
    return entry[1];
  });

  const percentages = METRICS.map((metric) => {
    const covered = entries.reduce((sum, entry) => sum + entry[metric].covered, 0);
    const total = entries.reduce((sum, entry) => sum + entry[metric].total, 0);
    const percentage = total === 0 ? 100 : (covered / total) * 100;
    const required = Math.max(MINIMUM_PERCENTAGE, baseline[group]?.[metric] ?? MINIMUM_PERCENTAGE);
    if (percentage < required) failed = true;
    return `${metric} ${percentage.toFixed(2)}% (minimum ${required.toFixed(2)}%)`;
  });

  console.log(`${group} coverage: ${percentages.join(', ')}.`);
}

if (failed) {
  console.error('Coverage gate failed. Frontend and Worker must each reach 60% and their versioned baseline in every metric.');
  process.exit(1);
}
