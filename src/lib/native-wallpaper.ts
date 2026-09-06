import { Capacitor } from "@capacitor/core"

type WallpaperPlugin = {
  setWallpaper(options: { url: string }): Promise<void>
}

declare global {
  interface Window {
    Capacitor?: { Plugins?: { Wallpaper?: WallpaperPlugin } }
  }
}

/**
 * Uses an optional native bridge when a host app supplies one. iOS does not expose
 * a public API for setting the home/lock wallpaper, so web and iOS callers should
 * use the system share sheet / Photos instructions instead.
 */
export async function setNativeWallpaper(url: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const plugin = window.Capacitor?.Plugins?.Wallpaper
  if (!plugin) return false
  await plugin.setWallpaper({ url })
  return true
}
