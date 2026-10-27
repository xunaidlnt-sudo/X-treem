export class BackgroundEffect {
  constructor(notify) {
    this.notify = notify;
    this.mask = document.createElement("canvas");
    this.output = document.createElement("canvas");
    this.person = document.createElement("canvas");
    this.output.width = this.person.width = 640;
    this.output.height = this.person.height = 360;
    this.last = 0;
    this.busy = false;
    this.ready = false;
    this.hasMask = false;
  }
  async enable() {
    if (this.worker) return;
    this.notify("Loading background model…");
    this.worker = new Worker(
      new URL("./background-worker.js", window.location.href),
    );
    this.worker.onmessage = ({ data }) => {
      if (data.type === "ready") {
        this.ready = true;
        this.delegate=data.delegate;
        this.notify(`Background processing ready · ${data.delegate}`);
      }
      if (data.type === "mask") {
        this.mask.width = data.width;
        this.mask.height = data.height;
        this.mask
          .getContext("2d")
          .putImageData(
            new ImageData(
              new Uint8ClampedArray(data.pixels),
              data.width,
              data.height,
            ),
            0,
            0,
          );
        if(!this.hasMask)this.notify(`Background active · ${this.delegate}`);
        this.hasMask = true;
        this.busy = false;
      }
      if (data.type === "error") {
        this.busy = false;
        this.ready = false;
        this.notify(data.message);
      }
    };
    this.worker.onerror = () => {
      this.ready = false;
      this.busy = false;
      this.notify(
        "Background model could not load. Reinstall the app or turn the effect off.",
      );
    };
    this.worker.postMessage({ type: "init" });
  }
  setImage(url) {
    if (this.imageURL === url) return;
    this.imageURL = url;
    this.image = null;
    if (url) {
      const img = new Image();
      img.onload = () => {
        if (this.imageURL === url) this.image = img;
      };
      img.src = url;
    }
  }
  frame(video, config) {
    if (
      !video ||
      video.readyState < 2 ||
      config.backgroundMode === "off" ||
      !config.backgroundMode
    )
      return video;
    if (!this.worker) void this.enable();
    if (!this.ready) return video;
    const now = performance.now();
    if (!this.busy && now - this.last > 80) {
      this.busy = true;
      this.last = now;
      createImageBitmap(video, { resizeWidth: 640, resizeHeight: 360 })
        .then((bitmap) => {
          if (this.worker)
            this.worker.postMessage({ type: "frame", bitmap, timestamp: now }, [
              bitmap,
            ]);
          else bitmap.close();
        })
        .catch(() => {
          this.busy = false;
        });
    }
    if (!this.hasMask) return video;
    this.setImage(config.backgroundImage);
    const w = this.output.width,
      h = this.output.height,
      ctx = this.output.getContext("2d"),
      person = this.person.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (config.backgroundMode === "blur") {
      ctx.filter = "blur(16px)";
      ctx.drawImage(video, -24, -14, w + 48, h + 28);
      ctx.filter = "none";
    } else if (config.backgroundMode === "image" && this.image) {
      const ratio = Math.max(w / this.image.width, h / this.image.height);
      ctx.drawImage(
        this.image,
        (w - this.image.width * ratio) / 2,
        (h - this.image.height * ratio) / 2,
        this.image.width * ratio,
        this.image.height * ratio,
      );
    } else if (config.backgroundMode === "animated") {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, config.accent || "#b5f060");
      g.addColorStop(1, "#152838");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(10,20,30,.18)";
        ctx.arc(
          w / 2 + Math.sin(now / 3500 + i) * 230,
          h / 2 + Math.cos(now / 3000 + i) * 120,
          80 + i * 12,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      ctx.fillStyle = config.backgroundColor || "#203b43";
      ctx.fillRect(0, 0, w, h);
    }
    person.clearRect(0, 0, w, h);
    person.globalCompositeOperation = "source-over";
    person.drawImage(video, 0, 0, w, h);
    person.globalCompositeOperation = "destination-in";
    person.drawImage(this.mask, 0, 0, w, h);
    person.globalCompositeOperation = "source-over";
    ctx.drawImage(this.person, 0, 0);
    return this.output;
  }
  disable() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.hasMask = false;
    this.busy = false;
  }
}
