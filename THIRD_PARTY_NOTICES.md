# Third-party software

X-treem application code is licensed under GPL-3.0-only. Copyright 2026 X-treem contributors.

## FFmpeg

This application bundles the unmodified Windows x64 FFmpeg 6.1.1 essentials binary from Gyan, distributed through `ffmpeg-static` 5.3.0. The binary is GPL v3 and contains third-party codecs and libraries. Its complete bundled license and build information are installed under `resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe.LICENSE` and `ffmpeg.exe.README`.

- Distributor and source/build information: https://www.gyan.dev/ffmpeg/builds/
- Exact FFmpeg source revision identified by the binary provider: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
- FFmpeg source release: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
- Binary release and distribution sources: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
- FFmpeg source/build instructions: https://ffmpeg.org/platform.html
- ffmpeg-static wrapper (GPL-3.0-or-later): https://github.com/eugeneware/ffmpeg-static

FFmpeg's own output from `ffmpeg -buildconf` provides enabled components and compiler configuration. Consult the provider's build information for corresponding third-party sources. The application does not modify FFmpeg or link its code into Electron.

## Interface and desktop runtime

- Electron: MIT, with bundled Chromium and Node.js notices. See `LICENSE.electron.txt` and `LICENSES.chromium.html` in the installed application directory.
- React and React DOM: MIT, https://github.com/facebook/react
- Lucide icons: ISC, https://github.com/lucide-icons/lucide
- Vite and electron-builder build tools: MIT.
- PeerJS and ws: MIT. PeerJS uses its public signaling and ICE services by default; the app does not operate these services.
- MediaPipe Tasks Vision 1.1.1: Apache-2.0, https://github.com/google-ai-edge/mediapipe . The browser bundle and WASM runtime are copied from the pinned npm package during builds.

## Person segmentation model

The bundled unmodified SelfieSegmenter landscape model is provided by Google MediaPipe. Model source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite . Model documentation/card: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter . MediaPipe repository license: Apache-2.0. The tracked binary SHA-256 is `490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e`. It is bundled to avoid runtime model downloads and keep inference local.

Dependency versions and integrity hashes are recorded in `package-lock.json`. Package license files are retained in the distributed dependency tree. StreamYard is a product reference only; no StreamYard assets or code are included.
