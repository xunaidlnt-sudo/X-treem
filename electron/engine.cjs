const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const ENCODERS = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264"];
function validateConfig(input) {
  if (!input || !["auto", ...ENCODERS].includes(input.encoder))
    throw Error("Choose a supported encoder.");
  if (
    ![720, 1080].includes(input.resolution) ||
    ![24, 30, 60].includes(input.fps)
  )
    throw Error("Unsupported output quality.");
  if (
    !Number.isInteger(input.bitrate) ||
    input.bitrate < 1500 ||
    input.bitrate > 20000
  )
    throw Error("Bitrate must be 1500–20000 Kbps.");
  if (
    !Array.isArray(input.orientations) ||
    !input.orientations.length ||
    input.orientations.length > 2 ||
    new Set(input.orientations).size !== input.orientations.length ||
    input.orientations.some((x) => !["landscape", "portrait"].includes(x))
  )
    throw Error("Choose output formats.");
  if (!Array.isArray(input.destinations) || input.destinations.length > 8)
    throw Error("Use up to eight destinations.");
  const destinations = input.destinations
    .filter((d) => d.enabled)
    .map((d) => {
      if (!input.orientations.includes(d.orientation))
        throw Error("An enabled destination uses a disabled format.");
      let u;
      try {
        u = new URL(d.url);
      } catch {
        throw Error("Enter a valid RTMP or RTMPS server URL.");
      }
      if (
        !["rtmp:", "rtmps:"].includes(u.protocol) ||
        !u.hostname ||
        u.username ||
        u.password ||
        /[\s|\[\]\\'\x00-\x1f]/.test(d.url)
      )
        throw Error(
          "Use a valid RTMP(S) server without credentials or special muxer characters.",
        );
      if (
        typeof d.key !== "string" ||
        d.key.length > 2048 ||
        /[\s|\[\]\\'\x00-\x1f]/.test(d.key)
      )
        throw Error("Stream key contains unsupported characters.");
      return {
        id: String(d.id).slice(0, 80),
        name: String(d.name || "Destination").slice(0, 80),
        orientation: d.orientation,
        url: d.url.replace(/\/$/, ""),
        key: d.key,
      };
    });
  if (!destinations.length && !input.record)
    throw Error("Enable a destination or local recording.");
  for (const o of input.orientations)
    if (!input.record && !destinations.some((d) => d.orientation === o))
      throw Error("Each output needs a destination or local recording.");
  return { ...input, destinations };
}
function encodingArgs(encoder, c) {
  const preset =
    encoder === "libx264"
      ? ["-preset", "veryfast", "-tune", "zerolatency"]
      : encoder === "h264_nvenc"
        ? ["-preset", "p4", "-tune", "ll"]
        : [];
  return [
    "-c:v",
    encoder,
    ...preset,
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    `${c.bitrate}k`,
    "-maxrate",
    `${c.bitrate}k`,
    "-bufsize",
    `${c.bitrate * 2}k`,
    "-g",
    String(c.fps * 2),
    "-r",
    String(c.fps),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
  ];
}
function outputArgs(c, orientation, recordingPath) {
  // Each destination is an independent output. FFmpeg propagates failures rather than silently reporting success.
  const targets = c.destinations
    .filter((d) => d.orientation === orientation)
    .map((d) => ({ url: d.key ? `${d.url}/${d.key}` : d.url, format: "flv" }));
  if (c.record) targets.push({ url: recordingPath, format: "matroska" });
  // A tee shares a single H.264/AAC encode across all destinations of this orientation.
  const escapePath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  return [
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    ...encodingArgs(c.encoder, c),
    "-flags",
    "+global_header",
    "-f",
    "tee",
    targets
      .map(
        (t) =>
          `[f=${t.format}:onfail=abort${t.format === "flv" ? ":rw_timeout=15000000" : ""}]${escapePath(t.url)}`,
      )
      .join("|"),
  ];
}
async function probeEncoder(binary, encoder) {
  return new Promise((resolve) => {
    const p = spawn(
      binary,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=size=128x128:rate=30",
        "-frames:v",
        "3",
        "-c:v",
        encoder,
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    const timer = setTimeout(() => {
      p.kill();
      resolve(false);
    }, 12000);
    p.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    p.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
class StreamEngine extends EventEmitter {
  constructor(binary) {
    super();
    this.binary = binary;
    this.jobs = new Map();
    this.stopping = false;
  }
  async detect() {
    const results = await Promise.all(
      ENCODERS.map(async (name) => ({
        name,
        available: await probeEncoder(this.binary, name),
      })),
    );
    return results;
  }
  start(config, paths) {
    if (this.jobs.size) throw Error("A session is already running.");
    const c = validateConfig(config);
    if (c.encoder === "auto")
      throw Error("Resolve automatic encoder before starting.");
    this.stopping = false;
    for (const orientation of c.orientations) {
      const args = [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-nostats",
        "-progress",
        "pipe:3",
        "-thread_queue_size",
        "512",
        "-i",
        "pipe:0",
        ...outputArgs(c, orientation, paths[orientation]),
      ];
      const p = spawn(this.binary, args, {
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe", "pipe"],
      });
      const job = { p, frames: 0 };
      this.jobs.set(orientation, job);
      p.stdin.on("error", () => {});
      // Never forward FFmpeg stderr: it can contain private stream keys.
      p.stderr.resume();
      let progress = "";
      p.stdio[3].on("data", (chunk) => {
        progress += chunk.toString();
        let i;
        while ((i = progress.indexOf("\n")) >= 0) {
          const line = progress.slice(0, i).trim();
          progress = progress.slice(i + 1);
          if (line.startsWith("frame=")) {
            job.frames = Number(line.slice(6));
            this.emit("status", {
              orientation,
              state: "encoding",
              frames: job.frames,
            });
          }
        }
      });
      p.once("error", () =>
        this.emit("status", {
          orientation,
          state: "error",
          message:
            "The encoder could not start. Reinstall the app or choose software encoding.",
        }),
      );
      p.once("exit", (code) => {
        this.jobs.delete(orientation);
        if (!this.stopping)
          this.emit("status", {
            orientation,
            state: "error",
            message: `Output stopped (code ${code}). Check your server, stream key, connection and encoder.`,
          });
      });
    }
  }
  async write(orientation, data) {
    const job = this.jobs.get(orientation);
    if (!job || job.p.stdin.destroyed)
      throw Error("Output is no longer running.");
    const b = Buffer.from(data);
    if (b.length > 16 * 1024 * 1024)
      throw Error("Capture buffer exceeded its limit.");
    await new Promise((resolve, reject) => {
      const t = setTimeout(
        () =>
          reject(Error("Encoder is too slow. Lower resolution or frame rate.")),
        15000,
      );
      job.p.stdin.write(b, (e) => {
        clearTimeout(t);
        e ? reject(Error("Encoder stopped receiving video.")) : resolve();
      });
    });
  }
  async stop() {
    this.stopping = true;
    await Promise.all(
      [...this.jobs.values()].map(
        ({ p }) =>
          new Promise((resolve) => {
            const timer = setTimeout(() => {
              p.kill();
              resolve();
            }, 8000);
            p.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
            p.stdin.end();
          }),
      ),
    );
    this.jobs.clear();
  }
}
module.exports = {
  validateConfig,
  outputArgs,
  encodingArgs,
  probeEncoder,
  StreamEngine,
  ENCODERS,
};
