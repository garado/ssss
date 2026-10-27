import { system } from "@silverbulletmd/silverbullet/syscalls";

/**
 * Shared config reader for the ssss plug.
 * Configured in CONFIG.md:
 *
 * ```space-lua
 * config.set {
 *   ssss = {
 *     features = { theme = true },
 *     theme = { themes = { "default", "nord", "nostalgia", "everforest", "gruvbox" } },
 *   },
 * }
 * ```
 */
export async function getSsssConfig(): Promise<Record<string, unknown>> {
  return await system.getConfig("ssss", {}) as Record<string, unknown>;
}

/** features are off unless explicitly set to `true` in `ssss.features.<name>` */
export async function isFeatureEnabled(name: string): Promise<boolean> {
  const cfg = await getSsssConfig();
  const features = cfg.features;
  if (!features || typeof features !== "object") return false;
  const flag = (features as Record<string, unknown>)[name];
  return flag === true;
}
