/** Package-metadata resolution shared by the client-module registry. */

import { createRequire } from 'node:module'

/** Return whether Node failed because the requested package path was absent. */
function isModuleNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
}

/**
 * Create the two-anchor package.json resolver used by the Host registry.
 * Profile-local packages take precedence; packages absent there fall back to
 * the installed runtime that owns the registry. This second anchor is required
 * by packaged applications whose writable profile cannot traverse an ASAR
 * symlink with Node's ordinary resolver.
 * @param profileBaseUrl - configuration-tree anchor for user-installed packages.
 * @param runtimeBaseUrl - installed-runtime anchor for bundled packages.
 * @returns a resolver for one package's exported package.json.
 */
export function createPackageJsonResolver(
  profileBaseUrl: string,
  runtimeBaseUrl: string,
): (specifier: string) => string {
  const fromProfile = createRequire(profileBaseUrl)
  const fromRuntime = createRequire(runtimeBaseUrl)
  return (specifier) => {
    try {
      return fromProfile.resolve(`${specifier}/package.json`)
    } catch (error) {
      if (!isModuleNotFound(error)) throw error
      return fromRuntime.resolve(`${specifier}/package.json`)
    }
  }
}
