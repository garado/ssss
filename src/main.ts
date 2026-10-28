/**
 * ssss (super special silverbullet setup)
 */

import { isFeatureEnabled } from "./config.ts";
import * as theme from "./features/theme/theme.ts";

export async function cycleTheme() {
  if (!(await isFeatureEnabled("theme"))) return;
  await theme.cycleTheme();
}

export async function setTheme() {
  if (!(await isFeatureEnabled("theme"))) return;
  await theme.setTheme();
}

export async function applyStoredTheme() {
  if (!(await isFeatureEnabled("theme"))) return;
  await theme.applyStoredTheme();
}

export async function toggleDarkMode() {
  if (!(await isFeatureEnabled("theme"))) return;
  await theme.toggleDarkMode();
}
