import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Buffer } from 'node:buffer'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath) {
  throw new Error('Usage: node --import tsx/esm decode-lasmex-session.mjs <input-session.jsonl.zstd> [output]')
}

const root = process.cwd()
const zstdMod = await import(pathToFileURL(root + '\\packages\\session\\session-persistence-jsonl\\src\\zstd.ts').href)
const formatMod = await import(pathToFileURL(root + '\\packages\\session\\session-persistence-jsonl\\src\\format.ts').href)
const { scanZstdFrames, createZstdFrameDecoder, decompressZstdPrefix, scanZstdFrames: _scanZstdFrames } = zstdMod
const { scanLog, toHeaderLine } = formatMod

const inPath = inputPath
const outPath = outputPath ?? `${inputPath}.jsonl`
const encoded = await readFile(inPath)
const scanned = scanZstdFrames(encoded)
const decoder = createZstdFrameDecoder()
const chunks: Buffer[] = []
for (const chunk of decoder.decode(encoded, scanned.frames)) {
  chunks.push(Buffer.from(chunk))
}
const logBytes = Buffer.concat(chunks)
const scannedLog = scanLog(logBytes)
const outLines = [JSON.stringify(toHeaderLine(scannedLog.meta)), ...scannedLog.events.map(event => JSON.stringify(event))]
await writeFile(outPath, outLines.join('\n') + '\n')
console.log(outPath)
