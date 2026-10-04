# Top Strip Acrylic 1.0.0

Initial public version.

- Native Windows Acrylic limited to the top tab and title strip.
- Opaque sidebar and note content.
- Native material and top icon colors follow the Obsidian app theme.
- Top portions of vertical workspace dividers are hidden.
- Styles and the native theme source are restored when disabled, subject to other native-theme writers.
- Single JavaScript plugin; no external executable, telemetry or runtime downloads.

Requires Windows 11 22H2 or newer and Obsidian 1.13.7 or newer. Uses Electron's process-wide native theme, which can affect native menus and other vault windows. Custom themes with top background images may be incompatible.

Manual installation: put the attached `main.js` and `manifest.json` in `.obsidian/plugins/top-strip-acrylic/`, reload Obsidian and enable the plugin. The release tag must be `1.0.0`.
