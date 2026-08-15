/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Known product label keys for shipped permission presets. */
export type PermissionPresetLabelKey = 'preset.readOnly' | 'preset.workspaceWrite' | 'preset.fullAccess'

/** Known impact-description keys for shipped permission presets. */
export type PermissionPresetDetailKey = 'preset.readOnly.detail' | 'preset.workspaceWrite.detail' | 'preset.fullAccess.detail'

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(value: string, name: string): string {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

/**
 * Render a shipped preset through the active product dictionary.
 * @param value - preset machine value.
 * @param fallbackName - host-supplied label for an extension preset.
 * @param t - translator for the owning permission namespace.
 * @returns the localized shipped label or the extension label.
 */
export function localizedPermissionPreset(
  value: string,
  fallbackName: string,
  t: (key: PermissionPresetLabelKey) => string,
): string {
  switch (value) {
    case 'read-only': return t('preset.readOnly')
    case 'workspace-write': return t('preset.workspaceWrite')
    case FULL_ACCESS_PRESET: return t('preset.fullAccess')
    default: return displayPresetName(fallbackName)
  }
}

/**
 * Resolve a localized impact sentence for a shipped preset.
 * @param value - preset machine value.
 * @param fallback - host-supplied description for an extension preset.
 * @param t - translator for the owning permission namespace.
 * @returns the localized shipped detail or the extension description.
 */
export function localizedPermissionDetail(
  value: string,
  fallback: string | undefined,
  t: (key: PermissionPresetDetailKey) => string,
): string | undefined {
  switch (value) {
    case 'read-only': return t('preset.readOnly.detail')
    case 'workspace-write': return t('preset.workspaceWrite.detail')
    case FULL_ACCESS_PRESET: return t('preset.fullAccess.detail')
    default: return fallback
  }
}
