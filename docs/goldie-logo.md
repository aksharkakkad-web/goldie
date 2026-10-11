# Goldie logo

Rishit's corrected selection is the supplied gold lowercase g with a chevron.
The built-in image-generation tool removed its white background and placed it on
a black rounded-square tile. The final PNG matches the installed Cursor icon's
alpha outline and padding, at 1024×1024, with transparent outer corners.

- Welcome/About/tab/panel icon: `theia-extensions/product/src/browser/icons/goldie/icon-dark.png`.
- Development Dock icon: `applications/electron/resources/goldie/icon-dark.png`.
- macOS icon bundle: `applications/electron/resources/goldie/icon-dark.icns`.

The gold g remains centered inside the black tile. There is no white background,
including in the g's counters. Earlier growth-emblem assets are not used by the standard Goldie frontend or macOS configuration.
Upstream artwork is preserved.

The development launcher sets the Dock icon through Electron's `app.dock.setIcon`
after the application is ready. Restart Electron after changing that icon or the
launcher. Frontend logo changes use the existing watch-and-reload workflow.
The macOS builder configuration also points to the Goldie `.icns`; no installer
or production application was packaged.

The unpackaged executable remains Electron.app. Its Finder bundle icon is separate
from the running Goldie Dock icon; do not modify the shared dependency's app bundle.
