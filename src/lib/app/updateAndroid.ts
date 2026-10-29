// Android updates for the sideloaded APK. The app compares its version with the newest GitHub release,
// downloads OpenFile-android.apk into its cache and opens the system installer (OpenFileUpdater plugin in
// mobile/android/.../UpdatePlugin.java). Before handing the file to the installer the plugin checks that the APK
// is OpenFile, is newer, and is signed with the same certificate as the installed app.
import { capCall, latestRelease, type Channel, type UpdateOffer } from './updateCore'

const P = 'OpenFileUpdater'
export const APK_ASSET = 'OpenFile-android.apk'

export interface AndroidInfo { version: string; code: number; sdk: number; canInstall: boolean; metered: boolean; online: boolean }
export interface AndroidProgress { state: 'idle' | 'downloading' | 'verified' | 'error'; done: number; total: number; error?: string }

export const androidInfo = () => capCall<AndroidInfo>(P, 'info')

export async function androidCheck(channel: Channel, current: string): Promise<UpdateOffer | null> {
  const r = await latestRelease(channel, APK_ASSET)
  if (!r) return null
  const apk = r.assets.find((a) => a.name === APK_ASSET)!.browser_download_url
  return { version: r.tag_name.replace(/^v/i, ''), current, notes: r.body || '', date: r.published_at, page: r.html_url, apk, prerelease: r.prerelease }
}

export const androidDownload = (url: string, version: string) => capCall<void>(P, 'download', { url, version })
export const androidProgress = () => capCall<AndroidProgress>(P, 'progress')
/** opens the system installer; rejects with "needs-permission" after opening the "Install unknown apps" screen */
export const androidInstall = () => capCall<void>(P, 'install')
export const androidOpen = (url: string) => capCall<void>(P, 'openUrl', { url })
