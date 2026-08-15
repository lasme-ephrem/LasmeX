/** Build native LasmeX bundles and distribution artifacts without Electron Packager. */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDesktopReleaseConfig } from '../lib/types/release-config.js'

const PRODUCT_NAME = 'LasmeX'
const PUBLISHER_NAME = 'LasmeX contributors'
const WINDOWS_APP_USER_MODEL_ID = 'com.squirrel.LasmeX.LasmeX'
const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'win32'])

const mode = process.argv[2]
if (mode !== 'package' && mode !== 'make') {
  throw new Error('desktop distribution mode must be "package" or "make"')
}
const targetPlatform = process.argv[3] ?? process.platform
if (!SUPPORTED_PLATFORMS.has(targetPlatform)) {
  throw new Error(`unsupported desktop target platform: ${targetPlatform}`)
}
if (targetPlatform !== process.platform) {
  throw new Error(`desktop ${targetPlatform} artifacts must be built on ${targetPlatform}, not ${process.platform}`)
}

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const workspaceRoot = resolve(appRoot, '../..')
const stage = resolve(appRoot, '.desktop-stage')
const archive = resolve(appRoot, '.desktop-app.asar')
const archiveUnpacked = `${archive}.unpacked`
const out = resolve(appRoot, 'out')
const makeOut = resolve(out, 'make')
const assets = resolve(appRoot, 'assets')
const manifest = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const rootManifest = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'))
const arch = process.arch
const portable = resolve(out, `${PRODUCT_NAME}-${targetPlatform}-${arch}`)
const releaseConfig = resolveDesktopReleaseConfig(process.env, targetPlatform)

/**
 * Adapts the repository's hardened brace-expansion override to minimatch 3's
 * callable CommonJS dependency before Electron ASAR loads it.
 *
 * @returns {void}
 */
function installLegacyBraceExpansionAdapter() {
  const require = createRequire(import.meta.url)
  const asarRequire = createRequire(require.resolve('@electron/asar/package.json'))
  const minimatchRequire = createRequire(asarRequire.resolve('minimatch'))
  const braceExpansionPath = minimatchRequire.resolve('brace-expansion')
  const braceExpansion = minimatchRequire('brace-expansion')
  if (typeof braceExpansion === 'function') return
  if (typeof braceExpansion?.expand !== 'function') {
    throw new Error('the hardened brace-expansion override does not expose expand()')
  }
  const cachedModule = minimatchRequire.cache[braceExpansionPath]
  if (cachedModule === undefined) throw new Error('brace-expansion did not enter the CommonJS module cache')
  cachedModule.exports = braceExpansion.expand
}

for (const ownedPath of [stage, archive, archiveUnpacked, out, makeOut, portable, assets]) {
  const relation = relative(appRoot, ownedPath)
  if (relation === '' || relation.startsWith(`..${sep}`) || relation === '..') {
    throw new Error(`desktop distribution path escaped the application directory: ${ownedPath}`)
  }
}
if (typeof manifest.version !== 'string' || manifest.version !== rootManifest.version) {
  throw new Error(`desktop distribution version ${String(manifest.version)} must match workspace ${String(rootManifest.version)}`)
}

const pnpmCli = process.env.npm_execpath
if (pnpmCli === undefined) throw new Error('desktop distribution requires execution through pnpm')

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? appRoot,
    env: options.env ?? process.env,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const stderr = options.capture ? result.stderr?.trim() : undefined
    throw new Error(`${basename(executable)} failed with exit code ${String(result.status)}${stderr ? `: ${stderr}` : ''}`)
  }
  return result.stdout ?? ''
}

function pnpm(args) {
  run(process.execPath, [pnpmCli, ...args], {
    cwd: workspaceRoot,
    env: { ...process.env, CI: 'true' },
  })
}

function requiredEnvironment(name) {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`desktop release requires ${name}`)
  return value
}

function resolveReleaseCredentials() {
  if (!releaseConfig.release) return undefined
  if (targetPlatform === 'win32') {
    const certificateFile = resolve(requiredEnvironment('WINDOWS_CERTIFICATE_FILE'))
    if (!existsSync(certificateFile)) throw new Error('WINDOWS_CERTIFICATE_FILE does not exist')
    return {
      certificateFile,
      certificatePassword: requiredEnvironment('WINDOWS_CERTIFICATE_PASSWORD'),
    }
  }
  if (targetPlatform === 'darwin') {
    const identity = requiredEnvironment('LASMEX_MACOS_SIGN_IDENTITY')
    const profile = process.env.LASMEX_MACOS_NOTARY_PROFILE
    const apiKey = process.env.APPLE_API_KEY
    const apiKeyId = process.env.APPLE_API_KEY_ID
    const apiIssuer = process.env.APPLE_API_ISSUER
    if (profile !== undefined && (apiKey !== undefined || apiKeyId !== undefined || apiIssuer !== undefined)) {
      throw new Error('configure macOS notarization with a keychain profile or API key, not both')
    }
    if (profile !== undefined && profile !== '') return { identity, notary: { profile } }
    if (apiKey === undefined || apiKeyId === undefined || apiIssuer === undefined) {
      throw new Error('macOS release requires LASMEX_MACOS_NOTARY_PROFILE or the APPLE_API_KEY triplet')
    }
    const resolvedApiKey = resolve(apiKey)
    if (!existsSync(resolvedApiKey)) throw new Error('APPLE_API_KEY does not exist')
    return { identity, notary: { apiKey: resolvedApiKey, apiKeyId, apiIssuer } }
  }
  return undefined
}

const releaseCredentials = resolveReleaseCredentials()
const electronDist = electronDistribution()
const windowsResourceEditor = targetPlatform === 'win32'
  ? resolve(electronWinstallerDirectory(), 'vendor', 'rcedit.exe')
  : undefined
const macSignerModule = targetPlatform === 'darwin' ? resolveMacSignerModule() : undefined

function findStagedLink(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = findStagedLink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

function materializeStagedLinks() {
  const nodeModules = resolve(stage, 'node_modules')
  let link = findStagedLink(nodeModules)
  while (link !== undefined) {
    const segments = link.slice(nodeModules.length + 1).split(/[\\/]/u)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      rmSync(resolve(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      link = findStagedLink(nodeModules)
      continue
    }
    const source = realpathSync(link)
    const nestedNodeModules = resolve(source, 'node_modules')
    rmSync(link, { recursive: true, force: true })
    cpSync(source, link, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    })
    link = findStagedLink(nodeModules)
  }
}

function stagedPackageDirectories(nodeModules) {
  if (!existsSync(nodeModules)) return []
  const packages = []
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(resolve(nodeModules, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) packages.push(resolve(nodeModules, entry.name, scoped.name))
      }
    } else {
      packages.push(resolve(nodeModules, entry.name))
    }
  }
  return packages.flatMap(directory => [directory, ...stagedPackageDirectories(resolve(directory, 'node_modules'))])
}

function hasStagedPackage(packageDirectory, name) {
  const segments = name.split('/')
  let directory = packageDirectory
  while (directory === stage || directory.startsWith(`${stage}${sep}`)) {
    if (existsSync(resolve(directory, 'node_modules', ...segments, 'package.json'))) return true
    if (directory === stage) break
    directory = dirname(directory)
  }
  return false
}

function assertRequiredPeers() {
  const missing = new Map()
  for (const directory of stagedPackageDirectories(resolve(stage, 'node_modules'))) {
    const packageManifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
    for (const name of Object.keys(packageManifest.peerDependencies ?? {})) {
      if (packageManifest.peerDependenciesMeta?.[name]?.optional === true) continue
      if (hasStagedPackage(directory, name)) continue
      const consumers = missing.get(name) ?? []
      consumers.push(packageManifest.name)
      missing.set(name, consumers)
    }
  }
  if (missing.size === 0) return
  const details = [...missing]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, consumers]) => `${name} (${[...new Set(consumers)].sort().join(', ')})`)
  throw new Error(`desktop staging is missing required peer dependencies: ${details.join('; ')}`)
}

function electronDistribution() {
  const require = createRequire(import.meta.url)
  const distribution = resolve(dirname(require.resolve('electron')), 'dist')
  if (!existsSync(distribution)) {
    pnpm(['--filter', 'lasmex-desktop', 'exec', 'install-electron'])
  }
  if (!existsSync(distribution)) throw new Error('pinned Electron distribution is unavailable')
  return distribution
}

function installApplicationResources(resourcesDirectory) {
  rmSync(resolve(resourcesDirectory, 'default_app.asar'), { force: true })
  copyFileSync(archive, resolve(resourcesDirectory, 'app.asar'))
  cpSync(archiveUnpacked, resolve(resourcesDirectory, 'app.asar.unpacked'), { recursive: true })
}

function electronWinstallerDirectory() {
  const require = createRequire(import.meta.url)
  const makerRequire = createRequire(require.resolve('@electron-forge/maker-squirrel/package.json'))
  return dirname(makerRequire.resolve('electron-winstaller/package.json'))
}

function editWindowsExecutable(executable) {
  if (windowsResourceEditor === undefined || !existsSync(windowsResourceEditor)) {
    throw new Error('Squirrel rcedit executable is unavailable')
  }
  run(windowsResourceEditor, [
    executable,
    '--set-icon', resolve(assets, 'icon.ico'),
    '--set-file-version', manifest.version,
    '--set-product-version', manifest.version,
    '--set-version-string', 'ProductName', PRODUCT_NAME,
    '--set-version-string', 'FileDescription', 'LasmeX desktop application',
    '--set-version-string', 'CompanyName', PUBLISHER_NAME,
    '--set-version-string', 'InternalName', PRODUCT_NAME,
    '--set-version-string', 'OriginalFilename', `${PRODUCT_NAME}.exe`,
  ])
}

function resolveMacSignerModule() {
  const rootRequire = createRequire(import.meta.url)
  const forgeRequire = createRequire(rootRequire.resolve('@electron-forge/cli/package.json'))
  const coreRequire = createRequire(forgeRequire.resolve('@electron-forge/core/package.json'))
  const packagerRequire = createRequire(coreRequire.resolve('@electron/packager/package.json'))
  return packagerRequire.resolve('@electron/osx-sign')
}

function configureMacBundle(appPath) {
  const contents = resolve(appPath, 'Contents')
  const macOs = resolve(contents, 'MacOS')
  const resources = resolve(contents, 'Resources')
  renameSync(resolve(macOs, 'Electron'), resolve(macOs, PRODUCT_NAME))
  installApplicationResources(resources)
  copyFileSync(resolve(assets, 'icon.icns'), resolve(resources, 'icon.icns'))
  const plist = resolve(contents, 'Info.plist')
  const plistBuddy = '/usr/libexec/PlistBuddy'
  for (const [key, value] of [
    ['CFBundleDisplayName', PRODUCT_NAME],
    ['CFBundleExecutable', PRODUCT_NAME],
    ['CFBundleIconFile', 'icon.icns'],
    ['CFBundleIdentifier', 'com.lasmex.desktop'],
    ['CFBundleName', PRODUCT_NAME],
    ['CFBundleShortVersionString', manifest.version],
    ['CFBundleVersion', manifest.version],
  ]) {
    run(plistBuddy, ['-c', `Set :${key} ${value}`, plist])
  }
}

function assemblePortable() {
  rmSync(portable, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  if (targetPlatform === 'darwin') {
    mkdirSync(portable)
    const appPath = resolve(portable, `${PRODUCT_NAME}.app`)
    cpSync(resolve(electronDist, 'Electron.app'), appPath, { recursive: true })
    configureMacBundle(appPath)
    return { root: portable, executable: appPath }
  }

  cpSync(electronDist, portable, { recursive: true })
  installApplicationResources(resolve(portable, 'resources'))
  if (targetPlatform === 'win32') {
    const executable = resolve(portable, `${PRODUCT_NAME}.exe`)
    renameSync(resolve(portable, 'electron.exe'), executable)
    editWindowsExecutable(executable)
    return { root: portable, executable }
  }

  const executable = resolve(portable, 'lasmex')
  renameSync(resolve(portable, 'electron'), executable)
  copyFileSync(resolve(assets, 'icon.png'), resolve(portable, 'resources', 'lasmex.png'))
  writeFileSync(resolve(portable, 'LasmeX.desktop'), [
    '[Desktop Entry]',
    'Type=Application',
    'Name=LasmeX',
    'Comment=LasmeX agentic development environment',
    'Exec=lasmex %U',
    'Icon=lasmex',
    'Categories=Development;',
    'Terminal=false',
    '',
  ].join('\n'))
  return { root: portable, executable }
}

async function signMacApplication(appPath, credentials) {
  if (macSignerModule === undefined) throw new Error('Electron macOS signer is unavailable')
  const { signAsync } = await import(pathToFileURL(macSignerModule).href)
  await signAsync({
    app: appPath,
    identity: credentials.identity,
    identityValidation: true,
    platform: 'darwin',
    type: 'distribution',
  })
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
}

function archiveMacApplication(appPath, destination) {
  rmSync(destination, { force: true })
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, destination])
}

function notarizeMacApplication(appPath, credentials) {
  const submission = resolve(makeOut, '.LasmeX-notarization.zip')
  archiveMacApplication(appPath, submission)
  const args = ['notarytool', 'submit', submission, '--wait']
  if ('profile' in credentials.notary) {
    args.push('--keychain-profile', credentials.notary.profile)
  } else {
    args.push(
      '--key', credentials.notary.apiKey,
      '--key-id', credentials.notary.apiKeyId,
      '--issuer', credentials.notary.apiIssuer,
    )
  }
  try {
    run('/usr/bin/xcrun', args)
    run('/usr/bin/xcrun', ['stapler', 'staple', appPath])
    run('/usr/bin/xcrun', ['stapler', 'validate', appPath])
  } finally {
    rmSync(submission, { force: true })
  }
}

async function makeWindows(bundle) {
  const { MakerSquirrel } = await import('@electron-forge/maker-squirrel')
  const maker = new MakerSquirrel({
    authors: PUBLISHER_NAME,
    description: manifest.description,
    exe: `${PRODUCT_NAME}.exe`,
    name: PRODUCT_NAME,
    noDelta: true,
    noMsi: true,
    setupExe: `${PRODUCT_NAME}-Setup-${manifest.version}-${arch}.exe`,
    setupIcon: resolve(assets, 'icon.ico'),
    title: PRODUCT_NAME,
    ...(releaseCredentials === undefined ? {} : {
      windowsSign: {
        certificateFile: releaseCredentials.certificateFile,
        certificatePassword: releaseCredentials.certificatePassword,
        description: 'LasmeX desktop application',
      },
    }),
  })
  await maker.prepareConfig(arch)
  return maker.make({
    appName: PRODUCT_NAME,
    dir: bundle.root,
    forgeConfig: { packagerConfig: { executableName: PRODUCT_NAME } },
    makeDir: makeOut,
    packageJSON: manifest,
    targetArch: arch,
    targetPlatform: 'win32',
  })
}

async function makeMac(bundle) {
  const appPath = bundle.executable
  mkdirSync(makeOut, { recursive: true })
  if (releaseCredentials !== undefined) {
    await signMacApplication(appPath, releaseCredentials)
    notarizeMacApplication(appPath, releaseCredentials)
  }
  const artifact = resolve(makeOut, `${PRODUCT_NAME}-${manifest.version}-darwin-${arch}.zip`)
  archiveMacApplication(appPath, artifact)
  return [artifact]
}

function makeLinux(bundle) {
  mkdirSync(makeOut, { recursive: true })
  const artifact = resolve(makeOut, `${PRODUCT_NAME}-${manifest.version}-linux-${arch}.tar.gz`)
  rmSync(artifact, { force: true })
  run('tar', ['-czf', artifact, '-C', out, basename(bundle.root)])
  return [artifact]
}

function artifactDigest(path) {
  const content = readFileSync(path)
  return {
    path: relative(appRoot, path).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(content).digest('hex'),
    size: statSync(path).size,
  }
}

function writeArtifactManifest(paths) {
  const artifacts = paths.map(artifactDigest)
  const path = resolve(makeOut, `manifest-${targetPlatform}-${arch}.json`)
  writeFileSync(path, `${JSON.stringify({
    product: PRODUCT_NAME,
    publisher: PUBLISHER_NAME,
    version: manifest.version,
    platform: targetPlatform,
    arch,
    signed: releaseConfig.release && targetPlatform !== 'linux',
    appUserModelId: targetPlatform === 'win32' ? WINDOWS_APP_USER_MODEL_ID : undefined,
    artifacts,
  }, null, 2)}\n`)
  return path
}

let deploymentStarted = false
try {
  rmSync(stage, { recursive: true, force: true })
  rmSync(archive, { force: true })
  rmSync(archiveUnpacked, { recursive: true, force: true })
  deploymentStarted = true
  pnpm([
    '--filter', 'lasmex-desktop',
    'deploy', stage,
    '--prod',
    '--legacy',
    '--config.node-linker=hoisted',
    '--config.link-workspace-packages=true',
  ])
  materializeStagedLinks()
  assertRequiredPeers()
  writeFileSync(resolve(stage, 'desktop.release.json'), `${JSON.stringify(releaseConfig, null, 2)}\n`)
  installLegacyBraceExpansionAdapter()
  const { createPackageWithOptions } = await import('@electron/asar')
  await createPackageWithOptions(stage, archive, {
    dot: true,
    unpack: '*.{node,dll,exe}',
  })
  if (!existsSync(archiveUnpacked)) {
    throw new Error('desktop ASAR did not produce the required native-binary sidecar')
  }

  const bundle = assemblePortable()
  if (mode === 'package') {
    process.stdout.write(`Portable LasmeX application: ${bundle.root}\n`)
  } else {
    const artifacts = targetPlatform === 'win32'
      ? await makeWindows(bundle)
      : targetPlatform === 'darwin'
        ? await makeMac(bundle)
        : makeLinux(bundle)
    const artifactManifest = writeArtifactManifest(artifacts)
    process.stdout.write(`LasmeX distribution manifest: ${artifactManifest}\n`)
  }
} finally {
  if (deploymentStarted) pnpm(['install', '--offline', '--frozen-lockfile', '--prod=false'])
}
