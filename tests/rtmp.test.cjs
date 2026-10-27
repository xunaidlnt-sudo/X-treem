const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const binary = require("ffmpeg-static");
const { StreamEngine } = require("../electron/engine.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
test(
  "fans out landscape to two RTMP receivers while portrait streams independently",
  { timeout: 45000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xtreem-rtmp-"));
    const receivers = [];
    const engine = new StreamEngine(binary);
    const errors = [];
    engine.on("status", (s) => {
      if (s.state === "error") errors.push(s);
    });
    try {
      const destinations = [];
      for (let i = 0; i < 3; i++) {
        const port = await freePort();
        const url = `rtmp://127.0.0.1:${port}/live`;
        const file = path.join(dir, `receiver-${i}.mkv`);
        const p = spawn(
          binary,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-listen",
            "1",
            "-i",
            `${url}/test`,
            "-c",
            "copy",
            "-f",
            "matroska",
            file,
          ],
          { windowsHide: true },
        );
        p.stderr.resume();
        const done = new Promise((resolve) =>
          p.on("exit", (code) => resolve(code)),
        );
        receivers.push({ p, done, file });
        destinations.push({
          id: String(i),
          name: `Local receiver ${i}`,
          enabled: true,
          url,
          key: "test",
          orientation: i === 2 ? "portrait" : "landscape",
        });
      }
      const fixture = path.join(dir, "input.webm");
      const gen = spawnSync(
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
          "sine=sample_rate=48000",
          "-t",
          "4",
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
      assert.equal(gen.status, 0);
      await sleep(500);
      engine.start(
        {
          encoder: "libx264",
          resolution: 720,
          fps: 30,
          bitrate: 2000,
          orientations: ["landscape", "portrait"],
          record: false,
          destinations,
        },
        {},
      );
      const data = await fs.readFile(fixture);
      await Promise.all(
        ["landscape", "portrait"].map((o) => engine.write(o, data)),
      );
      await engine.stop();
      for (const r of receivers) {
        await Promise.race([
          r.done,
          sleep(10000).then(() => {
            throw Error("RTMP receiver timed out");
          }),
        ]);
        assert.ok((await fs.stat(r.file)).size > 2000);
        const info = spawnSync(
          binary,
          ["-hide_banner", "-i", r.file, "-f", "null", "-"],
          { windowsHide: true },
        );
        assert.equal(info.status, 0, info.stderr.toString());
        assert.match(info.stderr.toString(), /Video: h264/);
        assert.match(info.stderr.toString(), /Audio: aac/);
      }
      assert.deepEqual(errors, []);
    } finally {
      await engine.stop();
      for (const r of receivers) r.p.kill();
      await sleep(100);
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
