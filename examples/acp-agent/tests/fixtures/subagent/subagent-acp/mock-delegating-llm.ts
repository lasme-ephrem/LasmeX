import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from 'lasmex-llm'
import { CallId, LlmAdapter } from 'lasmex-llm'

/**
 * Test adapter for the `mock-delegate` model: the first request calls the
 * `subagent` tool once, and the follow-up streams the tool result text back
 * verbatim — so the ACP child's answer (the scripted mock server's cwd echo)
 * reaches the REPL stdout for the driving e2e to assert.
 */
class MockDelegatingAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // The loop appends a plugin continuation notice after tool results, so the
    // tool result is not necessarily the last block of the last message; scan
    // messages backwards for it (same pattern as the headless cli mock).
    const toolResult = [...options.messages].reverse()
      .flatMap(message => message.content)
      .find(block => block.type === 'tool-result')

    if (toolResult === undefined) {
      const args = JSON.stringify({ description: 'cwd probe', prompt: 'report your workspace' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('call-delegate'), name: 'subagent', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('call-delegate'), name: 'subagent', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const toolResultText = toolResult.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')

    const reply = `child reported:\n${toolResultText}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: reply.length } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'mock-llm'
export const inject = ['llm']

/**
 * Register the delegating mock adapter under the `mock` provider.
 * @param ctx - the plugin context supplying `ctx.llm`.
 */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['mock'], new MockDelegatingAdapter())
}
