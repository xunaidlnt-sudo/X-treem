const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const { spawnSync } = require("node:child_process");
const base = path.join(__dirname, "../release/win-unpacked");
const archive = path.join(base, "resources/app.asar");
for (const name of fs.readdirSync(path.join(__dirname, "../electron"))) {
  const source = fs.readFileSync(path.join(__dirname, "../electron", name));
  assert.ok(
    asar.extractFile(archive, "electron/" + name).equals(source),
    "Packaged source mismatch: " + name,
  );
}
const html = asar
  .extractFile(archive, path.join("dist", "index.html"))
  .toString();
const match = html.match(/src="\.\/assets\/([^\"]+\.js)"/);
assert.ok(match, "Packaged renderer entry");
const js = asar
  .extractFile(archive, path.join("dist", "assets", match[1]))
  .toString();
assert.equal(
  js,
  fs.readFileSync(path.join(__dirname, "../dist/assets", match[1]), "utf8"),
  "Packaged renderer differs from tested build",
);
assert.ok(js.includes("Camera & audio devices"));
assert.ok(js.includes("Guest interview"));
assert.ok(js.includes("Guest video preview"));
assert.ok(js.includes("Show controls"));
assert.ok(js.includes("Headphone volume"));
const guestHtml = asar
  .extractFile(archive, path.join("dist", "guest.html"))
  .toString();
const guestMatch = guestHtml.match(/src="\.\/assets\/([^\"]+\.js)"/);
assert.ok(guestMatch);
assert.ok(
  asar
    .extractFile(archive, path.join("dist", "assets", guestMatch[1]))
    .toString()
    .includes("Share your screen"),
);
assert.ok(js.includes("Live comments"));
assert.ok(
  asar.extractFile(
    archive,
    path.join("dist", "models", "selfie_segmenter_landscape.tflite"),
  ).length > 200000,
);
const binary = path.join(
  base,
  "resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe",
);
const r = spawnSync(binary, ["-version"], { windowsHide: true });
assert.equal(r.status, 0);
console.log(
  "PASS packaged source parity, device/guest/chat UI, bundled segmentation model and bundled FFmpeg executable",
);
