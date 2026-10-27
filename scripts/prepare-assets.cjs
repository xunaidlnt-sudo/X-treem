const fs = require("node:fs");
const path = require("node:path");
const source = path.dirname(require.resolve("@mediapipe/tasks-vision"));
const target = path.join(__dirname, "../public/vendor");
fs.mkdirSync(path.join(target, "wasm"), { recursive: true });
fs.copyFileSync(
  path.join(source, "vision_bundle.js"),
  path.join(target, "vision_bundle.js"),
);
for (const name of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
])
  fs.copyFileSync(
    path.join(source, "wasm", name),
    path.join(target, "wasm", name),
  );
