export function shouldRenderInAppTypelessChatResult(args: { platformType: string }) {
  return args.platformType !== 'desktop'
}
