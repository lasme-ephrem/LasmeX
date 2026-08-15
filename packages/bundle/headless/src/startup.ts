/**
 * The one-shot app's command-line provider: it parses the task positional and
 * `--help`, then publishes {@link HEADLESS_STARTUP_SERVICE}. The runner is an
 * ordinary consumer whose lazy config waits for that service.
 * @module lasmex-headless/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { configureFrenchCommand, parseCmdline } from 'lasmex-cmdline'

/** Stable Cordis plugin name. */
export const name = 'headless-startup'

/** Services required before the task can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the one-shot runner. */
export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

/** What the runner row reads from {@link HEADLESS_STARTUP_SERVICE}. */
export interface HeadlessStartupValues {
  /** The task text this invocation asked for. */
  task: string
}

/**
 * This app's command: the task positional, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function headlessCommand(): Command {
  return configureFrenchCommand(new Command())
    .name('lasmex --profile headless')
    .description('Traiter une tâche, afficher la réponse finale puis quitter.')
    .helpOption('-h, --help', 'afficher cette aide')
    .argument('[task...]', 'texte de la tâche ; plusieurs mots sont réunis avec des espaces')
    .addHelpText('after', `
Exemple :
  lasmex --profile headless "lance les tests"  traiter une tâche puis quitter
`)
}

/**
 * Parse and provide the one-shot task as an ordinary Cordis service. The
 * command's action publishes the task; a missing or whitespace-only task is a
 * usage error, so on rejection (and on `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = headlessCommand()
  program.action(() => {
    const task = program.args.join(' ')
    if (task.trim() === '') program.error('erreur : une tâche est requise, par exemple : lasmex --profile headless "lance les tests"')
    ctx.provide(HEADLESS_STARTUP_SERVICE, { task } satisfies HeadlessStartupValues)
  })
  parseCmdline(ctx, program)
}
