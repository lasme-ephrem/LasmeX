import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from 'lasmex-llm'

const HIGH = ReasoningEffortId('high')
const OFF = ReasoningEffortId('off')

/** Keyless headless-agent adapter: one real memory call followed by a final answer. */
class CliMockAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [
          { id: OFF, name: 'Off' },
          { id: HIGH, name: 'High' },
        ],
        defaultEffort: HIGH,
      },
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (process.env.DSH_CLI_MOCK_FAILURE === '1') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'CLI mock provider failed' } } }
      return
    }
    // The loop appends a plugin continuation notice after tool results, so the
    // tool result is not necessarily the last block of the last message.
    const toolResult = [...options.messages].reverse()
      .flatMap(message => message.content)
      .find(block => block.type === 'tool-result')
    if (toolResult === undefined) {
      const bashRoundTrip = process.env.CLI_MOCK_TOOL === 'bash'
      const args = bashRoundTrip
        ? JSON.stringify({ command: 'printf CLI_TOOL_ROUND_TRIP', description: 'Prove the CLI tool round trip.' })
        : '{}'
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: CallId(bashRoundTrip ? 'cli-smoke-call' : 'cli-memory-list-call'),
        name: bashRoundTrip ? 'bash' : 'memory_list',
        argumentsDelta: args,
      }
      yield {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: CallId(bashRoundTrip ? 'cli-smoke-call' : 'cli-memory-list-call'),
          name: bashRoundTrip ? 'bash' : 'memory_list',
          arguments: args,
        },
      }
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const toolText = toolResult.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    const reply = process.env.CLI_MOCK_TOOL === 'bash'
      ? `CLI tool round trip complete: ${toolText.trim()}`
      : `CLI memory round trip complete: ${toolText.trim()}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'cli-mock-llm'
export const inject = ['llm']

/** Register the keyless `cli-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['cli-mock'], new CliMockAdapter())
  ctx.on('agent/request', async ({ step }, next) => {
    const config = await next()
    return step === 2 ? { ...config, reasoningEffort: OFF } : config
  })
}
