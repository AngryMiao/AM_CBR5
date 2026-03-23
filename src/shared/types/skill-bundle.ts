import { z } from 'zod'

export const SkillBundlePlatformSchema = z.enum(['darwin', 'win32', 'linux'])
export type SkillBundlePlatform = z.infer<typeof SkillBundlePlatformSchema>

export const SkillBundlePromptSchema = z.object({
  file: z.string(),
  examplesFile: z.string().optional(),
})
export type SkillBundlePrompt = z.infer<typeof SkillBundlePromptSchema>

export const SkillBundleRuntimeEnvBindingSchema = z.object({
  name: z.string(),
  source: z.enum(['literal', 'settings-path']),
  value: z.string().optional(),
  settingPath: z.string().optional(),
  defaultBundlePath: z.string().optional(),
  required: z.boolean().default(false),
})
export type SkillBundleRuntimeEnvBinding = z.infer<typeof SkillBundleRuntimeEnvBindingSchema>

export const SkillBundleRuntimeSchema = z.object({
  id: z.string(),
  transport: z.literal('mcp-stdio'),
  launcher: z.enum(['node-script']),
  entry: z.string(),
  name: z.string(),
  server: z.object({
    id: z.string(),
    name: z.string(),
  }),
  platforms: z.array(SkillBundlePlatformSchema).default(['darwin', 'win32']),
  env: z.array(SkillBundleRuntimeEnvBindingSchema).default([]),
})
export type SkillBundleRuntime = z.infer<typeof SkillBundleRuntimeSchema>

export const SkillBundleManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  prompt: SkillBundlePromptSchema,
  platforms: z.array(SkillBundlePlatformSchema),
  runtimes: z.array(SkillBundleRuntimeSchema).default([]),
})
export type SkillBundleManifest = z.infer<typeof SkillBundleManifestSchema>
