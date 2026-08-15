/** Fetch-only API carrier for secure custom schemes and in-process shells. */

import { AbstractApiClient } from './api.ts'

/**
 * Platform carrier that keeps every protocol path on Fetch, including the
 * API Proxy's SSE `host` and `mux` streams.
 */
export class FetchApiClient extends AbstractApiClient {
  /** @inheritdoc */
  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }
}
