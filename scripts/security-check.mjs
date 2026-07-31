import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const forbiddenTrackedFiles = [
  /^\.env($|\.)/,
  /^dist\//,
  /^node_modules\//,
  /^\.wrangler\//,
  /^\.dev\.vars$/,
  /(^|\/).*\.pem$/,
  /(^|\/).*\.p12$/,
  /(^|\/).*\.key$/,
];

const suspiciousPatterns = [
  { name: 'private key', pattern: /-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----/ },
  { name: 'Cloudflare API token', pattern: /\b(cfpat|CFPAT|cloudflare_api_token)\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'generic secret assignment', pattern: /\b(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{12,}['"]/i },
  { name: 'hard-coded local test password', pattern: /\bpassword123\b/i },
];

const allowedSecretReferences = new Set([
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'scripts/security-check.mjs',
  'src/worker.js',
]);

const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim().split('\n').filter(Boolean);
};

const trackedFiles = git(['ls-files']);
const failures = [];

for (const file of trackedFiles) {
  if (forbiddenTrackedFiles.some((pattern) => pattern.test(file))) {
    failures.push(`Forbidden tracked file: ${file}`);
  }
}

for (const file of trackedFiles) {
  if (file === 'package-lock.json') {
    continue;
  }

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const { name, pattern } of suspiciousPatterns) {
    if (pattern.test(content) && !allowedSecretReferences.has(file)) {
      failures.push(`Suspicious ${name} in ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Security check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Security check passed.');
