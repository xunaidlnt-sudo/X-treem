# Release validation

Validated locally on Windows x64 on 27 October 2026.

- Node integration tests: configuration validation, rejection of muxer control characters, per-format routing, actual FFmpeg H.264/AAC recording and delivery to three local RTMP receivers (two wide destinations and one portrait destination).
- Chat tests: YouTube paid-message normalization and polling/deduplication, Twitch IRC parsing and Bits, moderation events, relay limits and transport validation.
- Real Electron desktop test: synthetic camera/microphone, encrypted-settings round trip with no plaintext secret in the saved file, simultaneous 1280×720 and 720×1280 recording, decoding both finalized recordings.
- Device controls: the visible Devices dialog populates camera, microphone and output-device selectors; switching the synthetic camera is exercised without accessing user hardware.
- Background test: bundled MediaPipe worker loads locally, performs real segmentation and returns a mask used in the camera composition.
- Comment test: a local WebSocket relay delivers a synthetic paid message through the real main/preload/renderer path; the host previews it, selects on-stream display and triggers a reaction.
- Guest test: two actual Electron browser contexts using synthetic media connect over PeerJS/WebRTC; invitation token, guest consent, host waiting-room approval, live tracks, advancing preview playback and visible guest pixels in both output canvases are checked before recording the interview. The test waits for recording finalization before decoding files.
- 0.1.1 regression: sequential and concurrent duplicate incoming stream notifications must preserve live tracks and a single audio mix; removing a guest while playback starts must not restore the removed guest. All three tests failed against 0.1.0 before the fix.
- Both CPU (`libx264`) and Intel Quick Sync (`h264_qsv`) encoding were tested on the available machine. NVIDIA/AMD hardware was not available.
- Browser checks: studio controls, 1080p canvas resizing, explicit desktop-only streaming message, no horizontal overflow at the 1100-pixel minimum window width and no console errors on a clean load.

These are functional preview-release tests, not a certification for every platform, GPU, camera or network. No real broadcast, real paid transaction or user camera/microphone was used. YouTube/Twitch parser and connection logic tests use fixtures; live account credentials are required to verify those services end to end. The guest test uses two contexts on one machine, so it does not establish reliability across every NAT/firewall. Long-duration broadcasts, failure recovery and audio synchronization under extended load need further soak testing.

Commands:

```sh
npm test
npm run build
npm run test:desktop
```

The desktop test uses isolated temporary directories. To include the external PeerJS guest handshake on Windows PowerShell:

```powershell
$env:XTREEM_TEST_INTERVIEW='1'
npm run test:desktop
```

Set `XTREEM_TEST_ENCODER=h264_qsv` to exercise supported Intel hardware. The default is CPU. Tests make no third-party broadcast requests. The optional guest test contacts the PeerJS signaling/ICE services with synthetic media only.
