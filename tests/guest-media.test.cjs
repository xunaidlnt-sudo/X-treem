const test = require("node:test");
const assert = require("node:assert/strict");

let StudioMedia;
test.before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    ({ StudioMedia } = await server.ssrLoadModule("/src/media.js"));
  } finally {
    await server.close();
  }
});

function fixture() {
  const tracks = ["video", "audio"].map((kind) => ({
    kind,
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  }));
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  };
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
  global.document = {
    createElement: () => ({
      play: async () => {},
      pause() {},
      srcObject: null,
    }),
  };
  const media = Object.create(StudioMedia.prototype);
  Object.assign(media, {
    videos: {},
    config: {},
    audio: async () => {},
    audioOut: {},
    audioContext: {
      createMediaStreamSource: node,
      createGain: node,
      destination: {},
    },
  });
  return { media, stream, tracks };
}

test("separate audio/video notifications for the same guest preserve live tracks", async () => {
  const { media, stream, tracks } = fixture();
  await media.addGuest(stream, "Guest");
  await media.addGuest(stream, "Guest");
  assert.ok(
    tracks.every((t) => t.readyState === "live"),
    "Duplicate stream notification stopped the guest camera/audio",
  );
  assert.equal(media.videos.guest.srcObject, stream);
});

test("concurrent notifications do not stop the guest or duplicate its audio mixer", async () => {
  const { media, stream, tracks } = fixture();
  let mixers = 0;
  const create = media.audioContext.createMediaStreamSource;
  media.audioContext.createMediaStreamSource = (...args) => {
    mixers++;
    return create(...args);
  };
  await Promise.all([
    media.addGuest(stream, "Guest"),
    media.addGuest(stream, "Guest"),
  ]);
  assert.ok(tracks.every((t) => t.readyState === "live"));
  assert.equal(mixers, 1);
});

test("removing a guest during playback startup cannot restore its video or audio", async () => {
  const { media, stream } = fixture();
  let finish;
  global.document.createElement = () => ({
    play: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    pause() {},
    srcObject: null,
  });
  const attaching = media.addGuest(stream, "Guest");
  await new Promise((resolve) => setImmediate(resolve));
  media.removeGuest();
  finish();
  await attaching;
  assert.equal(media.videos.guest, undefined);
  assert.equal(media.guestSource, null);
});
