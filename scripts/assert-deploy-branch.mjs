import { execFileSync } from 'node:child_process'

const allowedBranch = 'master'
let branch
try {
  branch = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
  }).trim()
} catch (error) {
  // Some command wrappers return Git's successful output together with EPERM.
  branch = typeof error.stdout === 'string' ? error.stdout.trim() : ''
}

if (branch !== allowedBranch) {
  console.error(`Deployment blocked: current branch is ${branch || '(detached HEAD)'}. Deploy only from ${allowedBranch}.`)
  process.exit(1)
}
