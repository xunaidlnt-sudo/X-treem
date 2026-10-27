export class Countdown {
  constructor(clock = () => performance.now()) {
    this.clock = clock;
    this.cancel();
  }
  start(seconds, scene) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600)
      throw Error("Choose a countdown from 1 to 3600 seconds.");
    this.remaining = seconds * 1000;
    this.scene = scene;
    this.end = this.clock() + this.remaining;
    this.state = "running";
  }
  pause() {
    if (this.state === "running") {
      this.remaining = Math.max(0, this.end - this.clock());
      this.state = "paused";
    }
  }
  resume() {
    if (this.state === "paused") {
      this.end = this.clock() + this.remaining;
      this.state = "running";
    }
  }
  cancel() {
    this.state = "idle";
    this.remaining = 0;
    this.scene = null;
  }
  read() {
    const seconds = Math.ceil(
      (this.state === "running"
        ? Math.max(0, this.end - this.clock())
        : this.remaining) / 1000,
    );
    return {
      state: this.state,
      seconds,
      text: `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    };
  }
  complete() {
    if (this.state !== "running" || this.read().seconds > 0) return null;
    const scene = this.scene;
    this.cancel();
    return scene;
  }
}

export function studioShortcut(event) {
  if (
    event.repeat ||
    event.target?.closest?.(
      'input,textarea,select,[contenteditable="true"],[role="dialog"]',
    )
  )
    return null;
  if (
    event.ctrlKey &&
    event.altKey &&
    !event.shiftKey &&
    /^Digit[1-6]$/.test(event.code)
  )
    return {
      key: "scene",
      value: ["interview", "slate", "camera", "pip", "screen", "guest"][
        Number(event.code.slice(-1)) - 1
      ],
    };
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyM")
    return { key: "muted" };
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyG")
    return { key: "guestMuted" };
  return null;
}

export async function logoFromFile(file) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  )
    throw Error("Choose a PNG, JPG or WebP logo under 2 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
