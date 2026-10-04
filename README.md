# Top Strip Acrylic

Native Windows Acrylic for the top tab and title strip in Obsidian. The sidebar and note content stay opaque.

The plugin uses the Acrylic material provided by Windows, follows the light or dark theme selected in Obsidian, and keeps top-strip icons readable. It also hides the upper portion of vertical workspace dividers while retaining the divider below the strip.

## Requirements

- Windows 11 22H2 or newer, with Windows transparency effects enabled.
- Obsidian 1.13.7 or newer with an installer that supports Electron background materials.
- Obsidian's custom title bar and an ordinary top tab strip.

This plugin is desktop only. macOS, Linux and mobile are unsupported. A custom theme that draws background images in the top strip may be incompatible; the plugin reports the conflict and preserves that styling.

## Installation

Until the plugin is accepted into the community directory, install a GitHub release manually:

1. Create a folder named `top-strip-acrylic` inside your vault's `.obsidian/plugins` folder.
2. Download `main.js` and `manifest.json` from the same release and place them in that folder.
3. Reload Obsidian, then enable **Top Strip Acrylic** in **Settings → Community plugins**.

The plugin has one material: Windows Acrylic. There are no additional material presets or external executables to install. Disable overlapping transparency plugins before enabling it.

## Theme behavior

The material follows the base theme selected in Obsidian's Appearance settings. An explicit dark or light selection changes Electron's native theme source within the running Obsidian process. Selecting **Adapt to system** leaves the source on **system**, so automatic system theme changes keep working without restarting Obsidian. Native menus and other Obsidian windows in that process can follow the same source. When multiple vaults use different base themes, the last focused or theme-changed vault determines the shared native material theme.

The temporary light/dark toggle command can change Obsidian's page colors while the saved base theme remains **Adapt to system**. In that case, the native material continues following the system; select an explicit base theme in Appearance to override it.

This does not change Windows theme settings, registry values, or automatic day/night switching. Top icon colors follow the actual shared native theme so that they remain legible if another vault changes it.

Windows controls the Acrylic blur strength, tint and fallback behavior. The plugin does not expose a blur-radius setting. Depending on Windows settings, power state and window activity, Windows may reduce transparency or show a solid fallback. CSS alone cannot add blur to other applications behind the window.

## Disable and restore

Disable the plugin in Community plugins. It removes its own styles, restores the inline properties it changed, and clears the native material. It restores the original native theme source only if another plugin or window has not changed the source since its last write.

The Electron API does not provide a previous-material getter, so this plugin cannot restore a backdrop installed by another customization tool. Use one window-material plugin at a time. If a theme or an Obsidian update changes the top layout, the plugin stops rather than extending transparency into the workspace.

## Privacy

The plugin makes no network requests, reads no note content, and does not launch child processes or external programs. It does not write diagnostics or access files outside the vault. There is no telemetry, auto-updater or runtime dependency bundled with the plugin. Source code is unminified and available in this repository.

## Development

The release consists of `main.js` and `manifest.json`. Styles are included in `main.js`; no separate `styles.css` is required.

```sh
npm ci --ignore-scripts
npm test
npm run check
```

The tests cover top-strip boundaries, theme event coalescing, follow-system transitions, conflicts, unload restoration and unsupported platforms. They use a simulated DOM/native API and do not prove the Windows desktop blur itself. Native visual verification should be performed on Windows before a release. Theme integration uses the current app's internal vault configuration API, so compatibility should be checked after major Obsidian updates.

## License

MIT © BKmanli.
