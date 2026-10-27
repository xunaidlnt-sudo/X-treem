const test = require("node:test");
const assert = require("node:assert/strict");
let Countdown, studioShortcut, GuestShare;
test.before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      middlewareMode: true,
      hmr: { server: require("node:http").createServer() },
    },
    appType: "custom",
  });
  try {
    ({ Countdown, studioShortcut } =
      await server.ssrLoadModule("/src/show-tools.js"));
    ({ GuestShare } = await server.ssrLoadModule("/src/guest-share.js"));
  } finally {
    await server.close();
  }
});
test("countdown pauses, resumes and emits a completion exactly once", () => {
  let now = 0;
  const timer = new Countdown(() => now);
  assert.throws(() => timer.start(NaN, "camera"));
  assert.throws(() => timer.start(3601, "camera"));
  timer.start(10, "guest");
  now = 2500;
  timer.pause();
  now = 100000;
  assert.equal(timer.read().text, "00:08");
  assert.equal(timer.complete(), null);
  timer.resume();
  now += 7500;
  assert.equal(timer.complete(), "guest");
  assert.equal(timer.complete(), null);
  timer.start(1, "camera");
  timer.cancel();
  now += 10000;
  assert.equal(timer.complete(), null);
});
test("shortcuts ignore typing and repeat events, and separate scenes from mute controls", () => {
  const e = { ctrlKey: true, altKey: true, code: "Digit6" };
  assert.deepEqual(studioShortcut(e), { key: "scene", value: "guest" });
  assert.equal(studioShortcut({ ...e, repeat: true }), null);
  assert.equal(studioShortcut({ ...e, target: { closest: () => true } }), null);
  assert.deepEqual(
    studioShortcut({ ctrlKey: true, shiftKey: true, code: "KeyG" }),
    { key: "guestMuted" },
  );
});
function sharingFixture() {
  const cameraTrack = { kind: "video" },
    screenTrack = {
      kind: "video",
      stopped: false,
      stop() {
        this.stopped = true;
      },
      addEventListener() {},
    };
  const camera = { getVideoTracks: () => [cameraTrack] },
    screen = {
      getVideoTracks: () => [screenTrack],
      getTracks: () => [screenTrack],
    };
  const sender = {
    track: cameraTrack,
    async replaceTrack(t) {
      this.track = t;
    },
  };
  let call = { peerConnection: { getSenders: () => [sender] } };
  const changes = [];
  const share = new GuestShare({
    getCall: () => call,
    getCamera: () => camera,
    display: async () => screen,
    preview: () => {},
    changed: (b) => changes.push(b),
  });
  return {
    share,
    cameraTrack,
    screenTrack,
    sender,
    screen,
    changes,
    disconnect: () => {
      call = null;
    },
  };
}
test("screen sharing swaps video only and restores the original camera", async () => {
  const f = sharingFixture();
  await f.share.start();
  assert.equal(f.sender.track, f.screenTrack);
  await f.share.stop();
  assert.equal(f.sender.track, f.cameraTrack);
  assert.ok(f.screenTrack.stopped);
  assert.deepEqual(f.changes, [true, false]);
});
test("leaving while the screen picker is open stops the captured screen", async () => {
  const f = sharingFixture();
  let resolve;
  f.share.display = () => new Promise((r) => (resolve = r));
  const pending = f.share.start();
  f.disconnect();
  f.share.dispose();
  resolve(f.screen);
  await pending;
  assert.ok(f.screenTrack.stopped);
  assert.equal(f.sender.track, f.cameraTrack);
  assert.deepEqual(f.changes, []);
});
test("failed track replacement stops capture and keeps the camera selected", async () => {
  const f = sharingFixture();
  f.sender.replaceTrack = async () => {
    throw Error("incompatible video");
  };
  await assert.rejects(f.share.start());
  assert.ok(f.screenTrack.stopped);
  assert.equal(f.sender.track, f.cameraTrack);
});
