import { BackgroundEffect } from "./background";
import { drawComment, drawReactions } from "./overlays";
import { Countdown } from "./show-tools";
export class StudioMedia {
  constructor() {
    this.camera = null;
    this.screen = null;
    this.mic = null;
    this.recorders = [];
    this.level = 0;
    this.config = {};
    this.videos = {};
    this.startedAt = performance.now();
    this.backgroundEffect = new BackgroundEffect((message) =>
      this.onBackgroundStatus?.(message),
    );
    this.reactions = [];
    this.countdown = new Countdown();
    this.guestLevel = 0;
  }
  async attach(kind, stream) {
    this[kind]?.getTracks().forEach((t) => t.stop());
    this[kind] = stream;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    this.videos[kind] = video;
  }
  async enableCamera(id) {
    await this.attach(
      "camera",
      await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: id ? { exact: id } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      }),
    );
  }
  async enableMic(id) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: id ? { exact: id } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    await this.audio();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.micSource?.disconnect();
    this.mic = stream;
    this.micSource = this.audioContext.createMediaStreamSource(stream);
    this.micSource.connect(this.gain);
  }
  disable(kind) {
    this[kind]?.getTracks().forEach((t) => t.stop());
    this[kind] = null;
    delete this.videos[kind];
    if (kind === "mic") {
      this.micSource?.disconnect();
      this.micSource = null;
    }
  }
  async share(id) {
    if (window.studio) await window.studio.selectSource(id);
    await this.attach(
      "screen",
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      }),
    );
    this.screen.getVideoTracks()[0].addEventListener(
      "ended",
      () => {
        this.disable("screen");
        this.onScreenEnd?.();
      },
      { once: true },
    );
  }
  async audio() {
    if (this.audioContext) {
      await this.audioContext.resume();
      return;
    }
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.audioOut = this.audioContext.createMediaStreamDestination();
    this.hostAudioOut = this.audioContext.createMediaStreamDestination();
    this.gain = this.audioContext.createGain();
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.ratio.value = 3;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.compressor.connect(this.hostAudioOut);
    this.hostMonitor = this.audioContext.createGain();
    this.compressor.connect(this.hostMonitor);
    this.hostMonitor.connect(this.audioContext.destination);
    this.hostMonitor.gain.value = this.config.monitorHost
      ? (this.config.monitorVolume ?? 70) / 100
      : 0;
    this.analyser.connect(this.audioOut);
    const silence = this.audioContext.createOscillator();
    const zero = this.audioContext.createGain();
    zero.gain.value = 0;
    silence.connect(zero);
    zero.connect(this.audioOut);
    zero.connect(this.hostAudioOut);
    silence.start();
    await this.audioContext.resume();
    if (this.speakerId && this.audioContext.setSinkId)
      await this.audioContext.setSinkId(this.speakerId);
  }
  async setSpeaker(id) {
    this.speakerId = id;
    if (this.audioContext) {
      if (this.audioContext.setSinkId)
        await this.audioContext.setSinkId(id || "");
      else if (id)
        throw Error(
          "Speaker selection is unavailable. Choose the output in Windows sound settings.",
        );
    }
  }
  async testSpeaker() {
    await this.audio();
    const tone = this.audioContext.createOscillator(),
      volume = this.audioContext.createGain();
    tone.frequency.value = 440;
    volume.gain.setValueAtTime(0.08, this.audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(
      0.001,
      this.audioContext.currentTime + 0.6,
    );
    tone.connect(volume);
    volume.connect(this.audioContext.destination);
    tone.start();
    tone.stop(this.audioContext.currentTime + 0.65);
    tone.onended = () => {
      tone.disconnect();
      volume.disconnect();
    };
  }
  mount(landscape, portrait) {
    this.canvases = { landscape, portrait };
    const loop = () => {
      const nextScene = this.countdown.complete();
      if (nextScene) this.onCountdownEnd?.(nextScene);
      this.processedCamera = this.backgroundEffect.frame(
        this.videos.camera,
        this.config,
      );
      if (this.callCanvas) {
        const ctx = this.callCanvas.getContext("2d");
        ctx.fillStyle = "#17252c";
        ctx.fillRect(0, 0, 640, 360);
        const v = this.processedCamera;
        if (v && (!(v instanceof HTMLVideoElement) || v.readyState >= 2))
          ctx.drawImage(v, 0, 0, 640, 360);
      }
      for (const [o, c] of Object.entries(this.canvases)) this.draw(c, o);
      if (this.analyser) {
        const d = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(d);
        this.level = Math.min(
          1,
          Math.sqrt(d.reduce((s, n) => s + (n - 128) ** 2, 0) / d.length) / 60,
        );
      }
      if (this.guestAnalyser) {
        const data = new Uint8Array(this.guestAnalyser.fftSize);
        this.guestAnalyser.getByteTimeDomainData(data);
        this.guestLevel = Math.min(
          1,
          Math.sqrt(
            data.reduce((s, n) => s + (n - 128) ** 2, 0) / data.length,
          ) / 60,
        );
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  update(config) {
    this.config = config;
    if (this.logoUrl !== config.logoImage) {
      this.logoUrl = config.logoImage;
      this.logoImage = null;
      if (
        typeof config.logoImage === "string" &&
        config.logoImage.startsWith("data:image/png;base64,")
      ) {
        const img = new Image();
        const url = config.logoImage;
        img.onload = () => {
          if (this.logoUrl === url) this.logoImage = img;
        };
        img.src = url;
      }
    }
    if (this.hostMonitor)
      this.hostMonitor.gain.value = config.monitorHost
        ? (config.monitorVolume ?? 70) / 100
        : 0;
    if (this.guestMonitor)
      this.guestMonitor.gain.value =
        config.monitorGuest !== false ? (config.monitorVolume ?? 70) / 100 : 0;
    if (config.backgroundMode === "off") this.backgroundEffect.disable();
    if (this.guestGain)
      this.guestGain.gain.value = config.guestMuted
        ? 0
        : (config.guestVolume ?? 100) / 100;
    if (this.gain)
      this.gain.gain.value = config.muted ? 0 : config.volume / 100;
  }
  draw(canvas, orientation) {
    const c = this.config;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height,
      p = orientation === "portrait";
    ctx.fillStyle = c.background || "#172e32";
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#294b4f");
    grad.addColorStop(1, "#101e29");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const drawVideo = (video, x, y, width, height, cover) => {
      if (!video || (video instanceof HTMLVideoElement && video.readyState < 2))
        return false;
      const vw = video.videoWidth || video.width,
        vh = video.videoHeight || video.height;
      if (!vw || !vh) return false;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      ctx.filter = c.enhance
        ? "contrast(1.05) saturate(1.08) brightness(1.03)"
        : "none";
      const ratio = cover
        ? Math.max(width / vw, height / vh)
        : Math.min(width / vw, height / vh);
      ctx.drawImage(
        video,
        x + (width - vw * ratio) / 2,
        y + (height - vh * ratio) / 2,
        vw * ratio,
        vh * ratio,
      );
      ctx.restore();
      return true;
    };
    const camera = this.processedCamera || this.videos.camera,
      screen = this.videos.screen;
    let drawn = false;
    if (c.scene === "camera") drawn = drawVideo(camera, 0, 0, w, h, true);
    if (c.scene === "guest")
      drawn = drawVideo(
        c.guestVideoHidden ? null : this.videos.guest,
        0,
        0,
        w,
        h,
        !c.guestFit,
      );
    if (c.scene === "interview") {
      const gap = w * 0.016;
      const boxes = p
        ? [
            [w * 0.03, h * 0.05, w * 0.94, h * 0.4],
            [w * 0.03, h * 0.47, w * 0.94, h * 0.4],
          ]
        : [
            [w * 0.025, h * 0.16, w * 0.465, h * 0.66],
            [w * 0.51, h * 0.16, w * 0.465, h * 0.66],
          ];
      [camera, c.guestVideoHidden ? null : this.videos.guest].forEach(
        (v, i) => {
          const [x, y, bw, bh] = boxes[i];
          ctx.fillStyle = "#14212a";
          ctx.fillRect(x, y, bw, bh);
          drawVideo(v, x, y, bw, bh, i === 0 || !c.guestFit);
          ctx.fillStyle = "rgba(8,15,22,.8)";
          ctx.fillRect(x, y + bh - h * 0.055, bw, h * 0.055);
          ctx.fillStyle = "white";
          ctx.textAlign = "left";
          ctx.font = `600 ${h * (p ? 0.019 : 0.026)}px Arial`;
          ctx.fillText(
            i === 0 ? "Host" : this.guestName || "Guest seat",
            x + w * 0.015,
            y + bh - h * 0.019,
            bw - w * 0.03,
          );
        },
      );
      drawn = true;
    }
    if (c.scene === "screen" || c.scene === "pip") {
      drawn = drawVideo(screen, 0, 0, w, h, false);
      if (c.scene === "pip" && camera) {
        const width = p ? w * 0.42 : w * 0.25,
          height = width * 0.75;
        drawVideo(
          camera,
          w - width - w * 0.035,
          h - height - h * 0.14,
          width,
          height,
          true,
        );
        drawn = true;
      }
    }
    if (!drawn || c.scene === "slate") {
      ctx.fillStyle = "rgba(255,255,255,.035)";
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(
          w * 0.5,
          h * 0.47,
          Math.min(w, h) * (0.18 + i * 0.12),
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = "rgba(255,255,255,.07)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = c.accent || "#b5f060";
      ctx.font = `700 ${w * (p ? 0.11 : 0.07)}px Arial`;
      ctx.fillText(c.scene === "slate" ? "STAY TUNED" : "X", w / 2, h * 0.44);
      ctx.fillStyle = "white";
      ctx.font = `600 ${w * (p ? 0.048 : 0.032)}px Arial`;
      ctx.fillText(
        c.scene === "slate"
          ? c.slate || "We will be right back"
          : "Your story starts here",
        w / 2,
        h * 0.53,
        w * 0.9,
      );
      const timer = this.countdown.read();
      if (c.scene === "slate" && timer.state !== "idle") {
        ctx.fillStyle = c.accent || "#b5f060";
        ctx.font = `700 ${w * (p ? 0.14 : 0.09)}px Arial`;
        ctx.fillText(timer.text, w / 2, h * 0.73);
      }
      ctx.fillStyle = "#b3c5c7";
      ctx.font = `${w * (p ? 0.028 : 0.018)}px Arial`;
      ctx.fillText(
        c.scene === "slate"
          ? "Thanks for being here"
          : "Add your camera or share your screen",
        w / 2,
        h * 0.59,
      );
    }
    if (c.logo && this.logoImage) {
      const maxW =
        w *
        Math.min(0.3, Math.max(0.05, (c.logoSize || 12) / 100)) *
        (p ? 1.6 : 1);
      const maxH = h * 0.13;
      const scale = Math.min(
        maxW / this.logoImage.width,
        maxH / this.logoImage.height,
      );
      const lw = this.logoImage.width * scale,
        lh = this.logoImage.height * scale;
      ctx.drawImage(this.logoImage, w - lw - w * 0.04, h * 0.035, lw, lh);
    } else if (c.logo) {
      ctx.fillStyle = c.accent;
      ctx.fillRect(w * 0.04, h * 0.035, w * (p ? 0.25 : 0.1), h * 0.046);
      ctx.fillStyle = "#14200a";
      ctx.textAlign = "center";
      ctx.font = `bold ${h * (p ? 0.018 : 0.024)}px Arial`;
      ctx.fillText("X-TREEM", w * (p ? 0.165 : 0.09), h * 0.066);
    }
    if (c.lowerThird && c.title && !c.activeComment) {
      const x = w * 0.04,
        y = h * 0.79;
      ctx.fillStyle = "rgba(10,15,19,.88)";
      ctx.fillRect(x, y, w * (p ? 0.92 : 0.62), h * 0.12);
      ctx.fillStyle = c.accent;
      ctx.fillRect(x, y, w * 0.007, h * 0.12);
      ctx.textAlign = "left";
      ctx.fillStyle = "white";
      ctx.font = `bold ${h * (p ? 0.023 : 0.035)}px Arial`;
      ctx.fillText(c.title.slice(0, p ? 30 : 48), x + w * 0.025, y + h * 0.05);
      ctx.font = `${h * 0.023}px Arial`;
      ctx.fillStyle = "#c5cecf";
      ctx.fillText(
        (c.subtitle || "").slice(0, p ? 38 : 64),
        x + w * 0.025,
        y + h * 0.087,
      );
    }
    if (c.ticker) {
      ctx.fillStyle = c.accent;
      ctx.fillRect(0, h * 0.947, w, h * 0.053);
      ctx.fillStyle = "#15200d";
      ctx.font = `600 ${h * 0.025}px Arial`;
      ctx.textAlign = "left";
      const text = `${c.ticker}     •     `;
      const width = ctx.measureText(text).width;
      const offset =
        ((performance.now() - this.startedAt) * 0.06) % (width || 1);
      for (let x = -offset; x < w; x += width || w)
        ctx.fillText(text, x, h * 0.981);
    }
    drawComment(ctx, c.activeComment, w, h, c.accent);
    this.reactions = this.reactions.filter(
      (r) => performance.now() - r.at < 3500,
    );
    drawReactions(ctx, this.reactions, w, h);
  }
  react(emoji) {
    if (!["❤️", "👏", "🔥", "😂", "👍", "🎉"].includes(emoji)) return;
    for (let i = 0; i < 8; i++)
      this.reactions.push({
        emoji,
        at: performance.now() + i * 80,
        seed: Math.random(),
      });
    this.reactions = this.reactions.slice(-80);
  }
  async createCallStream() {
    await this.audio();
    this.callCanvas = document.createElement("canvas");
    this.callCanvas.width = 640;
    this.callCanvas.height = 360;
    const stream = this.callCanvas.captureStream(24);
    stream.addTrack(this.hostAudioOut.stream.getAudioTracks()[0]);
    return stream;
  }
  async addGuest(stream, name) {
    // PeerJS emits the same stream once per incoming track. Reserve it before
    // awaiting playback so the audio/video notifications share one attachment.
    if (this.guest === stream) return this.guestReady;
    this.removeGuest();
    this.guest = stream;
    this.guestName = name;
    const attachment = Symbol("guest");
    this.guestAttachment = attachment;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.videos.guest = video;
    this.guestReady = (async () => {
      await this.audio();
      if (this.guestAttachment !== attachment) return false;
      const connectAudio = () => {
        if (
          this.guestAttachment !== attachment ||
          this.guestSource ||
          !stream.getAudioTracks().length
        )
          return;
        this.guestSource = this.audioContext.createMediaStreamSource(stream);
        this.guestGain = this.audioContext.createGain();
        this.guestAnalyser = this.audioContext.createAnalyser();
        this.guestAnalyser.fftSize = 256;
        this.guestSource.connect(this.guestAnalyser);
        this.guestAnalyser.connect(this.guestGain);
        this.guestGain.connect(this.audioOut);
        this.guestMonitor = this.audioContext.createGain();
        this.guestSource.connect(this.guestMonitor);
        this.guestMonitor.connect(this.audioContext.destination);
        this.update(this.config);
      };
      this.guestTrackListener = connectAudio;
      stream.addEventListener?.("addtrack", connectAudio);
      connectAudio();
      await video.play();
      return this.guestAttachment === attachment;
    })().catch((error) => {
      if (this.guestAttachment !== attachment) return false;
      this.removeGuest();
      throw error;
    });
    return this.guestReady;
  }
  removeGuest() {
    this.guestAttachment = null;
    this.guest?.removeEventListener?.("addtrack", this.guestTrackListener);
    this.guestTrackListener = null;
    this.guestSource?.disconnect();
    this.guestGain?.disconnect();
    this.guestAnalyser?.disconnect();
    this.guestMonitor?.disconnect();
    this.guestAnalyser = null;
    this.guestMonitor = null;
    this.guestLevel = 0;
    this.guestSource = null;
    this.guestGain = null;
    // Remote tracks belong to the call. Detaching a view must not stop them.
    const video = this.videos.guest;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    delete this.videos.guest;
    this.guest = null;
    this.guestReady = null;
    this.guestName = null;
  }
  async start(config, onError) {
    await this.audio();
    this.update(this.config);
    const mime = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw Error("This computer does not support the capture format.");
    const result = await window.studio.start(config);
    try {
      for (const o of config.orientations) {
        const stream = this.canvases[o].captureStream(config.fps);
        stream.addTrack(this.audioOut.stream.getAudioTracks()[0]);
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: config.bitrate * 1500,
          audioBitsPerSecond: 160000,
        });
        const item = {
          recorder,
          stream,
          queue: Promise.resolve(),
          pending: 0,
          failed: false,
        };
        recorder.ondataavailable = (e) => {
          if (!e.data.size || item.failed) return;
          item.pending++;
          if (item.pending > 24) {
            item.failed = true;
            onError(
              "Capture is falling behind. Stop and lower output quality.",
            );
            return;
          }
          item.queue = item.queue
            .then(async () => {
              if (item.failed) return;
              await window.studio.chunk(o, await e.data.arrayBuffer());
            })
            .catch(() => {
              if (!item.failed) {
                item.failed = true;
                onError(
                  "The output stopped receiving video. Check the destination and encoder.",
                );
              }
            })
            .finally(() => item.pending--);
        };
        recorder.onerror = () =>
          onError(
            "Video capture failed. Stop the session and try a lower quality.",
          );
        recorder.start(250);
        this.recorders.push(item);
      }
      return result;
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  async stop() {
    await Promise.all(
      this.recorders.map(async (item) => {
        if (item.recorder.state !== "inactive")
          await new Promise((resolve) => {
            item.recorder.addEventListener("stop", resolve, { once: true });
            item.recorder.stop();
          });
        await item.queue;
        item.stream.getVideoTracks().forEach((t) => t.stop());
      }),
    );
    this.recorders = [];
    await window.studio?.stop();
  }
  dispose() {
    this.removeGuest();
    this.backgroundEffect.disable();
    cancelAnimationFrame(this.raf);
    for (const k of ["camera", "screen", "mic"]) this.disable(k);
    this.audioContext?.close();
  }
}
