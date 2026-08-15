/** Desktop renderer entry: the same shell boot over the custom local carrier. */
import { AppWebEntry } from 'lasmex-client-web'

const bootElement = document.getElementById('lasmex-boot-manifest')
if (!(bootElement instanceof HTMLScriptElement) || bootElement.type !== 'application/json') {
  throw new Error('desktop app: missing boot manifest')
}
const bootSource = bootElement.textContent
if (bootSource === null) throw new Error('desktop app: empty boot manifest')
;(globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__ = JSON.parse(bootSource) as unknown
bootElement.remove()

const element = document.getElementById('root')
if (element === null) throw new Error('desktop app: missing #root')
void new AppWebEntry(element).run()
