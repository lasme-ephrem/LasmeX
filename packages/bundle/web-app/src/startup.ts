/**
 * The web app's command-line provider: it parses the `lasmex web` flag
 * family (`--host`, `--port`, `--trusted-host`) and its `--help`
 * text, then provides the immutable values as {@link WEB_STARTUP_SERVICE}.
 * Ordinary rows inject that service before reading it from lazy config.
 * @module lasmex-web-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { configureFrenchCommand, parseCmdline } from 'lasmex-cmdline'

/** Stable Cordis plugin name. */
export const name = 'web-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** What the web rows read from {@link WEB_STARTUP_SERVICE}. */
export interface WebStartupValues {
  /** `--host`, absent when the invocation did not name one. */
  host?: string
  /** `--port`, absent when the invocation did not name one. */
  port?: number
  /** Explicit `--trusted-host` authorities, in argument order. */
  trustedHosts: string[]
}

/** The web flag family, as commander parsed it. */
interface WebOptions {
  host?: string
  port?: string
  trustedHost?: string[]
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function webCommand(): Command {
  return configureFrenchCommand(new Command())
    .name('lasmex web')
    .description('Servir l’interface Web de LasmeX.')
    .helpOption('-h, --help', 'afficher cette aide')
    .option('--host <host>', 'adresse locale d’écoute')
    .option('--port <port>', 'port d’écoute ; utiliser 0 pour laisser le système en choisir un')
    .option('--trusted-host <authority...>', 'autorité supplémentaire acceptée par la protection navigateur de /api (hôte ou hôte:port ; répétable)')
    .addHelpText('after', `
Exemples :
  lasmex web                                 servir sur l’adresse et le port configurés
  lasmex web --port 8080                     servir sur un autre port
`)
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; `--host 0.0.0.0`
 * or a non-numeric `--port` is a usage error, so on rejection (and on `--help`)
 * nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts<WebOptions>()
    if (options.host === '0.0.0.0') {
      program.error('erreur : --host 0.0.0.0 est refusé pour protéger l’exécution locale ; utilisez 127.0.0.1')
    }
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`erreur : --port doit être un nombre, valeur reçue ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
