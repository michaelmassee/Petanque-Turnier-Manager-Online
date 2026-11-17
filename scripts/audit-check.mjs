// npm audit --audit-level=high, aber mit einer Ausnahmeliste einzelner Advisories.
// Jede Ausnahme braucht eine Begründung und wird bei jedem Lauf ausgegeben, damit sie nicht vergessen wird.
import { spawnSync } from 'node:child_process'

const IGNORED_ADVISORIES = {
  // picomatch ReDoS: alle Versionen betroffen, noch kein Fix. Nur Build-/Testabhängigkeit über vite/vitest,
  // landet weder im Worker noch im Frontend. Entfernen, sobald picomatch einen Fix veröffentlicht.
  'GHSA-fc5q-39xc-vjpf': 'picomatch ReDoS (nur Build/Test, kein Fix verfügbar)',
}
const BLOCKING = new Set(['high', 'critical'])

const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' })
let report
try {
  report = JSON.parse(result.stdout)
} catch {
  console.error('npm audit lieferte kein JSON:\n' + (result.stdout || '') + (result.stderr || ''))
  process.exit(1)
}

// Advisories stehen als Objekte in via[]; Strings dort verweisen nur auf andere Pakete der Liste.
const advisories = new Map()
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'object' && via.url) advisories.set(via.url, via)
  }
}

const blocking = []
for (const advisory of advisories.values()) {
  if (!BLOCKING.has(advisory.severity)) continue
  const id = advisory.url.split('/').pop()
  if (IGNORED_ADVISORIES[id]) {
    console.warn(`npm audit: ${id} ignoriert – ${IGNORED_ADVISORIES[id]}`)
    continue
  }
  blocking.push(`${advisory.severity}: ${advisory.name} – ${advisory.title} (${advisory.url})`)
}

if (blocking.length > 0) {
  console.error('npm audit: blockierende Funde:\n' + blocking.map((line) => `  ${line}`).join('\n'))
  process.exit(1)
}
console.log('npm audit check passed.')
