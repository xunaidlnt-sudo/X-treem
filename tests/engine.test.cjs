const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  validateConfig,
  outputArgs,
  StreamEngine,
  probeEncoder,
} = require("../electron/engine.cjs");
const binary = require("ffmpeg-static");
const config = {
  encoder: "libx264",
  resolution: 720,
  fps: 30,
  bitrate: 2000,
  orientations: ["landscape", "portrait"],
  record: true,
  destinations: [],
};
test("rejects malformed configuration and muxer injection", () => {
  for (const delta of [
    { fps: 120 },
    { resolution: 2160 },
    { bitrate: 1 },
    { encoder: "evil" },
    { orientations: [] },
    { orientations: ["landscape", "landscape"] },
    { record: false },
  ])
    assert.throws(() => validateConfig({ ...config, ...delta }));
  for (const url of [
    "file:///secret",
    "https://example.com",
    "rtmp://server/live|bad",
    "rtmp://user:pass@server/live",
    "rtmp://server/live[bad]",
  ])
    assert.throws(() =>
      validateConfig({
        ...config,
        destinations: [
          { enabled: true, orientation: "landscape", url, key: "" },
        ],
      }),
    );
  assert.throws(() =>
    validateConfig({
      ...config,
      orientations: ["landscape"],
      destinations: [
        {
          enabled: true,
          orientation: "portrait",
          url: "rtmp://server/live",
          key: "a",
        },
      ],
    }),
  );
  assert.throws(() =>
    validateConfig({
      ...config,
      destinations: [
        {
          enabled: true,
          orientation: "landscape",
          url: "rtmp://server/live",
          key: "key|bad",
        },
      ],
    }),
  );
});
test("routes each destination only to its own orientation", () => {
  const c = validateConfig({
    ...config,
    destinations: [
      {
        enabled: true,
        name: "Wide",
        orientation: "landscape",
        url: "rtmps://example.com:443/live",
        key: "wide-key",
      },
      {
        enabled: true,
        name: "Tall",
        orientation: "portrait",
        url: "rtmp://example.com/live",
        key: "tall-key",
      },
    ],
  });
  const wide = outputArgs(c, "landscape", "C:/Videos/wide.mkv").at(-1);
  assert.match(wide, /wide-key/);
  assert.doesNotMatch(wide, /tall-key/);
  assert.match(wide, /onfail=abort/);
  assert.match(wide, /C\\:/);
});
test(
  "real FFmpeg encodes simultaneous video and audio recordings",
  { timeout: 40000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xtreem-engine-"));
    const fixture = path.join(dir, "input.webm");
    const generate = spawnSync(
      binary,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "2",
        "-c:v",
        "libvpx",
        "-deadline",
        "realtime",
        "-c:a",
        "libopus",
        fixture,
      ],
      { windowsHide: true },
    );
    assert.equal(generate.status, 0, generate.stderr.toString());
    assert.equal(await probeEncoder(binary, "libx264"), true);
    const engine = new StreamEngine(binary);
    const errors = [];
    engine.on("status", (s) => {
      if (s.state === "error") errors.push(s);
    });
    const paths = {
      landscape: path.join(dir, "wide.mkv"),
      portrait: path.join(dir, "tall.mkv"),
    };
    engine.start(config, paths);
    const input = await fs.readFile(fixture);
    await Promise.all(config.orientations.map((o) => engine.write(o, input)));
    await engine.stop();
    assert.deepEqual(errors, []);
    for (const file of Object.values(paths)) {
      assert.ok((await fs.stat(file)).size > 2000);
      const inspect = spawnSync(
        binary,
        ["-hide_banner", "-i", file, "-f", "null", "-"],
        { windowsHide: true },
      );
      assert.equal(inspect.status, 0, inspect.stderr.toString());
      assert.match(inspect.stderr.toString(), /Video: h264/);
      assert.match(inspect.stderr.toString(), /Audio: aac/);
    }
    await fs.rm(dir, { recursive: true, force: true });
  },
);
