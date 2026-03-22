import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillBundleManifestSchema } from './types'

describe('Angrymiao skill bundle manifest', () => {
  it('parses the bundled manifest', () => {
    const manifestPath = path.resolve(process.cwd(), 'skill-bundles/angrymiao-voice-control/manifest.json')
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const manifest = SkillBundleManifestSchema.parse(JSON.parse(raw))

    expect(manifest.id).toBe('angrymiao-voice-control')
    expect(manifest.runtimes).toHaveLength(1)
    expect(manifest.runtimes[0].server.name).toBe('system-control')
    expect(manifest.runtimes[0].entry).toBe('runtime/system-control-mcp/dist/index.js')
  })
})
