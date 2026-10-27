// Replaces only the outgoing video track; the guest microphone stays connected.
export class GuestShare {
  constructor({ getCall, getCamera, display, preview, changed }) {
    Object.assign(this, { getCall, getCamera, display, preview, changed });
    this.generation = 0;
  }
  async start() {
    const generation = ++this.generation;
    const call = this.getCall();
    const sender = call?.peerConnection
      ?.getSenders()
      .find((s) => s.track?.kind === "video");
    if (!sender) throw Error("Wait until the host accepts you before sharing.");
    const screen = await this.display({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15, max: 30 },
      },
      audio: false,
    });
    if (generation !== this.generation || call !== this.getCall()) {
      screen.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = screen.getVideoTracks()[0];
    try {
      await sender.replaceTrack(track);
      if (generation !== this.generation || call !== this.getCall()) {
        screen.getTracks().forEach((t) => t.stop());
        return;
      }
      this.screen = screen;
      this.preview(screen);
      this.changed(true);
      track.addEventListener(
        "ended",
        () => {
          void this.stop().catch(() => this.changed(false));
        },
        { once: true },
      );
    } catch (e) {
      screen.getTracks().forEach((t) => t.stop());
      throw e;
    }
  }
  async stop() {
    ++this.generation;
    const screen = this.screen;
    this.screen = null;
    const camera = this.getCamera();
    try {
      const sender = this.getCall()
        ?.peerConnection?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender && camera)
        await sender.replaceTrack(camera.getVideoTracks()[0]);
    } finally {
      screen?.getTracks().forEach((t) => t.stop());
      this.preview(camera || null);
      this.changed(false);
    }
  }
  dispose() {
    ++this.generation;
    this.screen?.getTracks().forEach((t) => t.stop());
    this.screen = null;
  }
}
