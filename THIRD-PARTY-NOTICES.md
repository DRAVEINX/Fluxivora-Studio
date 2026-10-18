# Third-party notices

## FFmpeg / ffmpeg-static

Fluxivora Studio beta.6 bundles the ffmpeg-static npm package version 5.3.0 to provide the native MP4 encoder used by Motion Studio. The npm package declares **GPL-3.0-or-later**. Its upstream package documentation identifies the bundled FFmpeg build as version 6.1.1 and explains that platform-specific binaries are downloaded from the upstream ffmpeg-static releases during installation.

- Package and license information: https://www.npmjs.com/package/ffmpeg-static
- Upstream source: https://github.com/eugeneware/ffmpeg-static
- FFmpeg project and source information: https://ffmpeg.org/

The application's MIT license does not replace the separate license terms for this bundled component. Anyone redistributing a Fluxivora Studio installer must review the exact FFmpeg binary and build configuration shipped with that installer and comply with all applicable third-party license, attribution, and corresponding-source requirements. The CI smoke test checks that the installed binary provides the required H.264 (libx264) and AAC encoders; it does not itself establish licensing compliance.

## Other dependencies

Electron and electron-builder retain their respective upstream licenses. Their terms are available from their upstream project pages and installed package metadata.
