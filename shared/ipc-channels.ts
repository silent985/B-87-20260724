export const ALLOWED_IPC_CHANNELS = [
  'read-file',
  'save-file',
  'list-dir',
  'get-app-path',
  'show-save-dialog',
  'rename-file',
  'close-window',
  'save-result',
] as const

export type AllowedChannel = typeof ALLOWED_IPC_CHANNELS[number]

export function isAllowedChannel(channel: string): channel is AllowedChannel {
  return (ALLOWED_IPC_CHANNELS as readonly string[]).includes(channel)
}
