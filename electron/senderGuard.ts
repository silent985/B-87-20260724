import { isInternalUrl } from './pathGuard'

/**
 * Pure decision for whether an incoming IPC message should be trusted.
 *
 * The main process must reject IPC that does not originate from our own
 * application window's frame — otherwise an injected iframe or hijacked frame
 * could invoke privileged filesystem channels. The Electron-specific parts
 * (comparing `event.sender` to the window's `webContents`, reading
 * `event.senderFrame`) are resolved by the caller into two plain inputs so the
 * trust rule itself is unit-testable:
 *
 * @param appUrl        the URL the window was loaded with
 * @param isMainSender  whether `event.sender` is our main window's webContents
 * @param frameUrl      the URL of the frame that sent the message (or null)
 */
export function isTrustedSenderFrame(
  appUrl: string,
  isMainSender: boolean,
  frameUrl: string | null | undefined,
): boolean {
  if (!isMainSender) {
    return false
  }
  if (!frameUrl) {
    return false
  }
  return isInternalUrl(appUrl, frameUrl)
}
