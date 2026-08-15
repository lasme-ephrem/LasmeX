/**
 * Commander adapter for the `lasmex` command line.
 *
 * The launcher parses only what it owns — which profile to boot, which extra
 * patch overlays to apply, and the config dumps — and hands **everything after
 * its own flags** to the booted tree verbatim, where injected app plugins parse
 * their own flag families and print their own `--help` (see
 * `lasmex-cmdline`). Launcher flags therefore come first: the first
 * token this parser does not recognize starts the inner arguments, so
 * `lasmex --profile tui --resume abc` boots the tui profile with `--resume abc`,
 * and `lasmex --profile web -h` prints the web app's help, not this one's.
 *
 * `web` is a hardcoded alias for `--profile web`; `plugin` manages a profile's
 * plugin dependencies by forwarding to pnpm.
 * @module lasmex/args
 */

import { Command, CommanderError } from 'commander'
import { configureFrenchCommand } from 'lasmex-cmdline'

/** Boot a named profile and hand it the invocation's inner arguments. */
interface ProfileInvocation {
  mode: 'profile'
  profile: string
  /** Extra patch-list overlays applied after the profile's own layer, in argv order. */
  patches: string[]
  /** Everything after the launcher's own flags, verbatim, for injected app plugins. */
  args: string[]
}

/** Print a composed profile tree and exit without booting. */
interface DumpConfigInvocation {
  mode: 'dump-config'
  profile: string
  /** Omit the profile's user layer and --patch overlays; print bundle layers only. */
  defaultOnly: boolean
  patches: string[]
}

/** Manage a profile's plugins: forward `args` to pnpm inside the profile directory. */
interface PluginInvocation {
  mode: 'plugin'
  profile: string
  /** Raw pnpm arguments, verbatim. */
  args: string[]
}

/** The resolved LasmeX invocation. Help, version, and errors exit inside {@link parseLasmexArgs}. */
export type LasmexInvocation = ProfileInvocation | DumpConfigInvocation | PluginInvocation

/** Launcher flags shared by the default command and the `web` alias. */
interface BootOptions {
  patch?: string[]
  dumpConfig?: boolean
  dumpDefaultConfig?: boolean
}

/**
 * Repeatable single-value collector: `--patch a.yml --patch b.yml`. Never
 * variadic — a variadic `--patch` would swallow the inner arguments.
 */
const collect = (value: string, previous: string[] = []): string[] => [...previous, value]

/** The launcher's own help text; each app prints its own. */
const HELP_EXAMPLES = `
Exemples :
  lasmex --profile web                       lancer le profil Web (identique à lasmex web)
  lasmex --profile headless "lance les tests" traiter une tâche, afficher le résultat puis quitter
  lasmex --profile tui --patch ./extra.yml   lancer un profil avec une couche supplémentaire
  lasmex --profile tui --resume <session>    transmettre les arguments restants à l’application
  lasmex --profile web --help                afficher l’aide propre à l’application Web
  lasmex plugin --profile tui add <package>  installer un plugin dans le profil tui
`

/**
 * Resolve a boot or dump invocation from the launcher flags and the leftover
 * inner arguments.
 * @param program - the command whose options were parsed (the root, or the `web` alias).
 * @param profile - the profile these flags boot.
 * @param options - the launcher flags commander collected.
 * @param args - the leftover arguments, in argv order.
 * @returns the resolved invocation.
 */
function resolveBoot(program: Command, profile: string, options: BootOptions, args: string[]): LasmexInvocation {
  const patches = options.patch ?? []
  if (patches.includes('')) program.error('erreur : --patch exige un chemin')
  if (options.dumpConfig !== true && options.dumpDefaultConfig !== true) {
    return { mode: 'profile', profile, patches, args }
  }
  if (options.dumpConfig === true && options.dumpDefaultConfig === true) {
    program.error('erreur : --dump-config et --dump-default-config sont incompatibles')
  }
  // The dump is boot-free: it never runs app command-line providers, so it
  // cannot show what those flags would decide, and printing a tree that differs
  // from the same invocation's boot would mislead.
  if (args.length > 0) {
    program.error(`erreur : l’affichage de configuration n’accepte aucun argument applicatif ; reçu ${args.map(argument => JSON.stringify(argument)).join(' ')}`)
  }
  const defaultOnly = options.dumpDefaultConfig === true
  if (defaultOnly && patches.length > 0) {
    program.error('erreur : --dump-default-config affiche les couches du profil et n’accepte aucun --patch')
  }
  return { mode: 'dump-config', profile, defaultOnly, patches }
}

/**
 * Resolve argv into one invocation, or print and exit for help, version, or an
 * error.
 * @param argv - arguments after the Node binary and script.
 * @param version - version string printed by `--version`.
 * @returns the resolved invocation.
 */
export function parseLasmexArgs(argv: readonly string[], version: string): LasmexInvocation {
  let resolved: LasmexInvocation | undefined
  // Annotated, not inferred: the actions below call back into `program`, and an
  // inferred type would be circular through its own chain.
  const program: Command = configureFrenchCommand(new Command())
  program
    .name('lasmex')
    .version(version, '-V, --version', 'afficher le numéro de version')
    .description('LasmeX : lancer un profil agentique composé de plugins.')
    .addHelpText('after', HELP_EXAMPLES)
    .exitOverride()
    // The launcher's flags come first and end at the first token it does not
    // know; everything from there on belongs to the booted app, including
    // its -h. `lasmex -h` with no profile still prints this help, below.
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', 'arguments transmis à l’application du profil (voir : lasmex --profile <nom> --help)')
    .option('--profile <name>', 'profil à lancer depuis $LASMEX_HOME/profiles ou ~/.lasmex/profiles')
    .option('--patch <path>', 'couche de configuration ajoutée après le profil (répétable)', collect)
    .option('--dump-config', 'afficher la composition effective puis quitter')
    .option('--dump-default-config', 'afficher la composition sans couche utilisateur ni --patch puis quitter')
    .action((args: string[], options: BootOptions & { profile?: string }) => {
      // With the app owning -h, the launcher's own help is what a bare
      // `lasmex -h` (no profile to hand it to) must print.
      if (options.profile === undefined) {
        if (args.some(argument => argument === '-h' || argument === '--help')) program.help()
        program.error('erreur : --profile <nom> est requis')
      }
      const profile = options.profile
      if (profile === '') program.error('erreur : --profile exige un nom')
      resolved = resolveBoot(program, profile, options, args)
    })

  /** Reject parent options supplied before a subcommand. */
  const rejectParentOptions = (command: string): void => {
    const parent = program.opts<BootOptions & { profile?: string }>()
    if (parent.profile !== undefined || parent.patch !== undefined
      || parent.dumpConfig !== undefined || parent.dumpDefaultConfig !== undefined) {
      program.error(`erreur : ${command} n’accepte aucune option parente --profile, --patch, --dump-config ou --dump-default-config`)
    }
  }

  const web = program.command('web').description('lancer le profil Web (alias de --profile web) ; les options Web suivent')
  web
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', 'arguments de l’application Web (voir : lasmex web --help)')
    .option('--patch <path>', 'couche de configuration ajoutée après le profil (répétable)', collect)
    .option('--dump-config', 'afficher la composition Web effective puis quitter')
    .option('--dump-default-config', 'afficher les couches Web sans couche utilisateur puis quitter')
    .action((args: string[], options: BootOptions) => {
      rejectParentOptions('web')
      resolved = resolveBoot(web, 'web', options, args)
    })

  const plugin = program.command('plugin').description('gérer les plugins d’un profil en transmettant les arguments restants à pnpm')
  plugin
    .requiredOption('--profile <name>', 'profil à gérer, initialisé lors de la première utilisation')
    .allowUnknownOption()
    .argument('[args...]', 'arguments pnpm transmis tels quels (add <pkg>, remove <pkg>, why <pkg>, ...)')
    .action((args: string[], options: { profile: string }) => {
      rejectParentOptions('plugin')
      if (options.profile === '') program.error('erreur : --profile exige un nom')
      if (args.length === 0) program.error('erreur : plugin exige des arguments pnpm, par exemple add <package>')
      resolved = { mode: 'plugin', profile: options.profile, args }
    })

  try {
    program.parse(argv, { from: 'user' })
  } catch (error) {
    return process.exit(error instanceof CommanderError ? error.exitCode : 1)
  }
  /* v8 ignore next -- an action resolves or Commander throws */
  if (resolved === undefined) throw new Error('lasmex : aucune invocation résolue')
  return resolved
}
