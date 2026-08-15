import { fileURLToPath } from 'node:url'
import { CallId, LlmAdapter, type GenerateOptions, type Message, type StreamChunk } from 'lasmex-llm'
import { boot, loadOverlayPatches } from 'lasmex-app-boot'
import { runFixtureTurn } from 'lasmex-loader-smoke'
import { SessionId } from 'lasmex-session'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('context-before-prompt snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))

function sourceLabel(message: Message): string {
  return message.source.kind === 'plugin'
    ? `plugin:${message.source.plugin}`
    : message.source.kind
}

class LocalCaptureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const step = this.requests.length
    const tail = options.messages.at(-1)
    const tailText = tail?.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('') ?? ''
    return (async function* (): AsyncIterable<StreamChunk> {
      // This deliberately weak local stand-in repeats the call whenever the
      // continuation tail repeats the user's imperative tool name.
      if (step === 1
        || (tailText.includes('memory_list') && !tailText.includes('Completed tool calls: memory_list.'))) {
        const id = CallId(`memory-list-${step}`)
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id, name: 'memory_list', argumentsDelta: '{}' }
        yield {
          type: 'block-end',
          index: 0,
          block: { type: 'tool-call', id, name: 'memory_list', arguments: '{}' },
        }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      const text = 'LasmeX local opérationnel.'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }
}

const ctx = await boot('context-before-prompt-snapshot', rootConfigPath, [
  ...loadOverlayPatches('context-before-prompt-snapshot', basePatchPath),
  ...loadOverlayPatches('context-before-prompt-snapshot', overlayPath),
])

try {
  ctx.systemPrompt.context({ name: 'test:local-runtime', order: 0, text: 'Runtime: local adapter.' })
  const adapter = new LocalCaptureAdapter()
  ctx.llm.registerAdapter(['local-capture'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('context-before-prompt-snapshot'),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'local-capture', model: 'local-capture' },
  })
  try {
    const eventSources: string[] = []
    let toolCalls = 0
    const result = await runFixtureTurn(ctx, {
      task: 'Utilise memory_list une seule fois, puis réponds exactement : LasmeX local opérationnel.',
      onEvent(_sessionId, event) {
        if (event.type === 'user/message') eventSources.push(sourceLabel(event.data))
        if (event.type === 'tool/call') toolCalls += 1
      },
    })
    const firstRequest = adapter.requests[0]
    const secondRequest = adapter.requests[1]
    if (firstRequest === undefined || secondRequest === undefined) {
      throw new Error('local capture adapter did not receive both tool-continuation requests')
    }
    const tail = secondRequest.messages.at(-1)
    const tailBlock = tail?.content.length === 1 ? tail.content[0] : undefined
    process.stdout.write(`${JSON.stringify({
      eventSources,
      firstRequestSources: firstRequest.messages.map(sourceLabel),
      secondRequestSources: secondRequest.messages.map(sourceLabel),
      toolHistory: secondRequest.messages.some(message => message.content.some(block => block.type === 'tool-call'))
        && secondRequest.messages.some(message => message.content.some(block => block.type === 'tool-result')),
      toolCalls,
      tail: tailBlock?.type === 'text' ? tailBlock.text : null,
      output: result.output,
    })}\n`)
  } finally {
    await handle.dispose()
  }
} finally {
  await ctx.fiber.dispose()
}
