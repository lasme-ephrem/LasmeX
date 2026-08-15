import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const runnerPrivatePnpmDestination = '${{ runner.temp }}/setup-pnpm'

describe('CI workflow', () => {
  it('isolates every pnpm action setup destination per runner', () => {
    const workflow: unknown = yaml.load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'))
    if (!isRecord(workflow) || !isRecord(workflow.jobs)) throw new TypeError('CI workflow must define jobs')

    const setups = Object.entries(workflow.jobs).flatMap(([jobName, job]) => {
      if (!isRecord(job) || !Array.isArray(job.steps)) return []
      return job.steps.flatMap((step) => {
        if (!isRecord(step) || typeof step.uses !== 'string' || !step.uses.startsWith('pnpm/action-setup@')) return []
        return [{ jobName, step }]
      })
    })

    expect(setups.length).toBeGreaterThan(0)
    for (const { jobName, step } of setups) {
      expect(step, `${jobName} must not share pnpm/action-setup's default destination`).toMatchObject({
        with: { dest: runnerPrivatePnpmDestination },
      })
    }
  })

  it('uses public hosted Linux and Windows runners for every required pull-request lane', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.jobs)
      || !isRecord(workflow.jobs.windows)
      || !isRecord(workflow.jobs['windows-native'])
      || !isRecord(workflow.jobs['node-24'])
      || !isRecord(workflow.jobs['node-24-coverage'])
      || !isRecord(workflow.jobs['node-24-consumers'])
      || !isRecord(workflow.jobs['platform-build'])
      || !isRecord(workflow.jobs['all-checks-passed'])) {
      throw new TypeError('CI workflow must define public platform jobs and the aggregate')
    }

    const aggregate = workflow.jobs['all-checks-passed']
    if (!Array.isArray(aggregate.needs)) throw new TypeError('CI aggregate must define needs')
    for (const name of ['node-24', 'node-24-coverage', 'node-24-consumers']) {
      const job = workflow.jobs[name]
      if (!isRecord(job)) throw new TypeError(`${name} must be defined`)
      expect(job['runs-on']).toBe('ubuntu-24.04')
    }
    expect(workflow.jobs['windows-native']['runs-on']).toBe('windows-2025')
    expect(workflow.jobs.windows['runs-on']).toBe('ubuntu-24.04')
    expect(workflow.jobs['platform-build'].strategy).toMatchObject({
      matrix: { os: ['ubuntu-24.04', 'macos-14', 'windows-2025'] },
    })
    expect(aggregate['runs-on']).toBe('ubuntu-24.04')
    expect(aggregate.needs).toContain('windows')
    expect(aggregate.needs).toContain('windows-native')
    expect(aggregate.needs).toContain('platform-build')
    expect(JSON.stringify(workflow)).not.toMatch(/dsh-(?:ubuntu|windows)|self-hosted|DSH_CI_FAILOVER/)
  })

  it('keeps master runs while cancelling superseded pull-request and manual runs', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.concurrency)) throw new TypeError('CI workflow must define concurrency')
    expect(workflow.concurrency['cancel-in-progress']).toBe("${{ github.event_name != 'push' }}")
  })

  it('keeps supported LSP source under native Windows coverage', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain('packages/lsp/lsp-stdio/src/connection.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/index.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/instance.ts')
  })

  it('requires one release-shaped Python runtime target on every pull request', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    const pythonRuntime = workflowJob(workflow, 'python-runtime')
    const aggregate = workflowJob(workflow, 'all-checks-passed')
    if (!Array.isArray(aggregate.needs)) {
      throw new TypeError('CI aggregate must define required job dependencies')
    }

    expect(pythonRuntime).toMatchObject({
      if: "github.event_name == 'pull_request'",
      name: 'python runtime / release-shaped Linux x64',
      uses: './.github/workflows/build-exe-for-python-sdk.yml',
      with: {
        targets: 'node24-linux-x64',
        ci: true,
      },
    })
    expect(aggregate.needs).toContain('python-runtime')
  })

  it('keeps every Vitest project process-isolated on native Windows', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain("pool: process.platform === 'win32' ? 'threads' : 'forks'")
    expect(config.match(/pool: 'forks'/g)).toHaveLength(2)
  })
})

describe('E2B e2e workflow', () => {
  it('is manual-only and fails loud before running the focused live suite', () => {
    const workflow = loadWorkflow('.github/workflows/e2b-e2e.yml')
    expect(workflow.on).toEqual({ workflow_dispatch: null })
    if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs.e2b) || !Array.isArray(workflow.jobs.e2b.steps)) {
      throw new TypeError('E2B e2e workflow must define the e2b job steps')
    }

    const steps = workflow.jobs.e2b.steps.filter(isRecord)
    const preflight = steps.find(step => step.name === 'Preflight (require E2B API key)')
    const e2b = steps.find(step => step.name === 'E2B tests (live sandbox)')

    expect(preflight).toMatchObject({
      env: { E2B_API_KEY: '${{ secrets.E2B_API_KEY_EXTERNAL }}' },
    })
    expect(preflight?.run).toContain('E2B_API_KEY_EXTERNAL repository secret')
    expect(e2b).toMatchObject({
      env: {
        E2B_API_KEY: '${{ secrets.E2B_API_KEY_EXTERNAL }}',
        DSH_E2E_MAX_WORKERS: '1',
        DSH_EXAMPLE_MODE: 'lib',
      },
    })
    expect(e2b?.run).toContain('packages/e2b/e2b/tests/composition.e2e.ts')
  })
})

describe('Python release workflows', () => {
  it('publishes npm, Python, and GitHub artifacts through protected OIDC jobs', () => {
    const validation = loadWorkflow('.github/workflows/python-release.yml')
    const release = loadWorkflow('.github/workflows/release.yml')
    const pythonWheels = workflowJob(release, 'python-wheels')
    const draft = workflowJob(release, 'attest-and-draft')
    const publishNpm = workflowJob(release, 'publish-npm')
    const publishRuntime = workflowJob(release, 'publish-python-runtime')
    const publishSdk = workflowJob(release, 'publish-python-sdk')
    const finalize = workflowJob(release, 'finalize')

    expect(JSON.stringify(validation)).not.toContain('gh-action-pypi-publish')
    expect(pythonWheels).toMatchObject({
      uses: './.github/workflows/build-exe-for-python-sdk.yml',
      with: {
        targets: 'node24-linux-x64,node24-linux-arm64,node24-macos-arm64',
        release: true,
      },
    })
    expect(draft).toMatchObject({
      environment: 'github-release',
      permissions: { attestations: 'write', contents: 'write', 'id-token': 'write' },
    })
    expect(publishNpm).toMatchObject({
      environment: 'npm-publish',
      permissions: { contents: 'read', 'id-token': 'write' },
    })
    expect(publishRuntime).toMatchObject({
      environment: 'pypi-runtime',
      permissions: { contents: 'read', 'id-token': 'write' },
    })
    expect(publishSdk).toMatchObject({
      environment: 'pypi',
      permissions: { contents: 'read', 'id-token': 'write' },
    })
    expect(finalize.needs).toEqual([
      'attest-and-draft',
      'publish-npm',
      'publish-python-runtime',
      'publish-python-sdk',
    ])
    const serialized = JSON.stringify(release)
    expect(serialized).not.toContain('NPM_TOKEN')
    expect(serialized).not.toContain('attestations:false')
    expect(serialized).toContain('actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6')
    expect(serialized.match(/pypa\/gh-action-pypi-publish@/g)).toHaveLength(2)
  })

  it('exposes the native wheel builder to the release caller with normalized versions', () => {
    const workflow = loadWorkflow('.github/workflows/build-exe-for-python-sdk.yml')
    const call = workflowEvent(workflow, 'workflow_call')
    const plan = workflowJob(workflow, 'plan')
    const build = workflowJob(workflow, 'build')
    if (!isRecord(call.inputs) || !Array.isArray(plan.steps) || !Array.isArray(build.steps)) {
      throw new TypeError('Python wheel builder must define workflow_call inputs and plan steps')
    }

    const buildSteps: unknown[] = build.steps
    const manylinuxAddon = buildSteps.find(step => isRecord(step) && step.name === 'Rebuild Linux node-pty against manylinux 2.28')
    const macosCheck = buildSteps.find(step => isRecord(step) && step.name === 'Check macOS deployment target')
    const manylinuxSmoke = buildSteps.find(step => isRecord(step) && step.name === 'Run wheel in a manylinux 2.28 container')
    expect(call.inputs).toHaveProperty('targets')
    expect(call.inputs).toMatchObject({
      ci: { type: 'boolean', default: false },
      release: { type: 'boolean', default: false },
    })
    expect(workflow.concurrency).toMatchObject({
      group: 'build-single-exe-${{ github.workflow }}-${{ github.ref }}',
    })
    expect(plan.if).toContain('inputs.ci')
    expect(plan.if).toContain('inputs.release')
    expect(JSON.stringify(plan.steps)).toContain('pep440_version')
    expect(JSON.stringify(workflow)).toContain('macosx_14_0_arm64')
    expect(manylinuxAddon).toMatchObject({ if: "runner.os == 'Linux'" })
    expect(JSON.stringify(manylinuxAddon)).toContain('manylinux_2_28_x86_64')
    expect(JSON.stringify(manylinuxAddon)).toContain('manylinux_2_28_aarch64')
    expect(JSON.stringify(manylinuxAddon)).toContain('$HOME/setup-pnpm:$HOME/setup-pnpm:ro')
    expect(JSON.stringify(manylinuxAddon)).toContain('node-pty-glibc-versions.txt')
    expect(JSON.stringify(manylinuxAddon)).toContain('le 2.28')
    expect(macosCheck).toMatchObject({ if: "runner.os == 'macOS'" })
    expect(JSON.stringify(macosCheck)).toContain('scripts/check-macos-deployment-target.py')
    expect(JSON.stringify(macosCheck)).toContain('$EXE-spawn-helper')
    expect(manylinuxSmoke).toMatchObject({ if: "runner.os == 'Linux'" })
    expect(JSON.stringify(manylinuxSmoke)).toContain('-e LASMEX_TELEMETRY_DISABLED')
  })

  it('uses the shared macOS deployment-target check in GitLab', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const runtimeWheel = workflow['.runtime-wheel']
    if (!isRecord(runtimeWheel) || !Array.isArray(runtimeWheel.script)) {
      throw new TypeError('GitLab CI must define the runtime wheel script')
    }
    const runtimeScript: unknown[] = runtimeWheel.script
    const macosCheck = runtimeScript.find(
      step => typeof step === 'string' && step.includes('PLATFORM" = macos-arm64'),
    )
    if (typeof macosCheck !== 'string') {
      throw new TypeError('GitLab CI must check the macOS deployment target')
    }

    expect(macosCheck).toContain('scripts/check-macos-deployment-target.py')
    expect(macosCheck).toContain('"$EXE" "$EXE-spawn-helper"')
  })
})

describe('Issue lifecycle workflow', () => {
  it('uses repository labels and the built-in token for explicit review handoffs', () => {
    const lifecycle = loadWorkflow('.github/workflows/issue-lifecycle.yml')
    const lifecyclePullRequest = workflowEvent(lifecycle, 'pull_request_target')
    const lifecycleReview = workflowEvent(lifecycle, 'pull_request_review')
    const lifecycleJob = workflowJob(lifecycle, 'lifecycle')
    const policy = loadWorkflow('.github/workflows/issue-policy.yml')
    const policyPullRequest = workflowEvent(policy, 'pull_request')

    expect(lifecyclePullRequest.types).not.toContain('ready_for_review')
    expect(lifecyclePullRequest.types).toContain('review_requested')
    expect(lifecycleReview.types).toEqual(['submitted'])
    expect(lifecycleJob.if).toContain("github.event_name == 'pull_request_target'")
    expect(lifecycleJob.if).toContain("github.event.action == 'review_requested'")
    expect(lifecycleJob.if).toContain("github.event_name == 'pull_request_review'")
    expect(lifecycleJob.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    )
    expect(lifecycleJob.if).toContain("github.actor != 'dependabot[bot]'")
    expect(lifecycle.permissions).toMatchObject({ contents: 'read', issues: 'write' })
    expect(JSON.stringify(lifecycleJob)).not.toContain('create-github-app-token')
    expect(JSON.stringify(lifecycleJob)).not.toContain('LASMEX_ISSUE_APP')
    expect(JSON.stringify(lifecycleJob)).toContain('github.event.repository.default_branch')
    expect(JSON.stringify(lifecycleJob)).not.toContain('github.event.pull_request.head.sha')
    expect(JSON.stringify(lifecycleJob)).not.toContain('refs/pull/')
    expect(JSON.stringify(lifecycleJob)).toContain('${{ github.token }}')
    expect(policyPullRequest.types).toContain('ready_for_review')
  })
})

describe('Git hooks', () => {
  it('leaves frozen Agent Note sidecars to the archive verifier', () => {
    const lefthook = loadWorkflow('lefthook.yml')

    for (const hookName of ['pre-commit', 'pre-merge-commit']) {
      const hook = lefthook[hookName]
      if (!isRecord(hook) || !Array.isArray(hook.jobs)) {
        throw new TypeError(`lefthook must define ${hookName} jobs`)
      }
      const pairing: unknown = hook.jobs.find(
        (job: unknown) => isRecord(job) && job.name === 'translation pairing (staged records)',
      )

      expect(pairing).toMatchObject({ exclude: ['.agents/notes/archived/**'] })
    }
  })
})

function loadWorkflow(path: string): Record<string, unknown> {
  const workflow: unknown = yaml.load(readFileSync(resolve(root, path), 'utf8'))
  if (!isRecord(workflow)) throw new TypeError(`${path} must define a workflow`)
  return workflow
}

function workflowEvent(workflow: Record<string, unknown>, event: string): Record<string, unknown> {
  if (!isRecord(workflow.on) || !isRecord(workflow.on[event])) {
    throw new TypeError(`workflow must define the ${event} event`)
  }
  return workflow.on[event]
}

function workflowJob(workflow: Record<string, unknown>, job: string): Record<string, unknown> {
  if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs[job])) {
    throw new TypeError(`workflow must define the ${job} job`)
  }
  return workflow.jobs[job]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
