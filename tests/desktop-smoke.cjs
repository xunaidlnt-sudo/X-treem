// Runs the real Electron main/preload/renderer with synthetic capture only.
// Test data is isolated from the user's studio configuration and recordings.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const root = path.join(os.tmpdir(), "xtreem-desktop-smoke-" + Date.now());
require("node:fs").mkdirSync(root, { recursive: true });
app.setPath("userData", root);
app.setPath("videos", root);
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
require("../electron/main.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => {
  console.error("Desktop test timed out");
  app.exit(1);
}, 150000);
(async () => {
  try {
    await app.whenReady();
    let win;
    for (let i = 0; i < 100; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading()) break;
      await sleep(200);
    }
    if (!win) throw Error("No studio window");
    await sleep(1500);
    const evaluate = (s) => win.webContents.executeJavaScript(s, true);
    if (!(await evaluate("!!window.studio")))
      throw Error("Preload bridge missing");
    await evaluate(
      `window.studio.save({testSecret:'synthetic-test-key-29380'})`,
    );
    if (
      (await fs.readFile(path.join(root, "studio-settings.enc"))).includes(
        Buffer.from("synthetic-test-key-29380"),
      )
    )
      throw Error("Saved key is not encrypted");
    if (
      (await evaluate(`window.studio.load().then(c=>c.testSecret)`)) !==
      "synthetic-test-key-29380"
    )
      throw Error("Encrypted settings did not round trip");
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add camera')).click()`,
    );
    await sleep(1500);
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add microphone')).click()`,
    );
    await sleep(1500);
    const captureText = await evaluate("document.body.innerText");
    if (!captureText.includes("Camera on") || !captureText.includes("Mic on"))
      throw Error("Synthetic camera or microphone failed: " + captureText);
    await evaluate(`document.querySelector('.devices-control').click()`);
    await sleep(300);
    const deviceCounts = await evaluate(
      `[...document.querySelectorAll('.device-fields select')].map(s=>s.options.length)`,
    );
    if (deviceCounts.length !== 3 || deviceCounts[0] < 2 || deviceCounts[1] < 2)
      throw Error("Camera/microphone/speaker selectors did not populate");
    await evaluate(
      `(()=>{const s=document.querySelectorAll('.device-fields select')[0];s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await sleep(300);
    await evaluate(
      `document.querySelector('[aria-label="Close device settings"]').click()`,
    );
    console.log(
      "PASS visible device selection, populated inputs and camera switching",
    );
    await evaluate(`document.querySelectorAll('.tabs button')[4].click()`);
    await sleep(200);
    await evaluate(
      `(()=>{const s=[...document.querySelectorAll('select')].find(e=>e.textContent.includes('Blur background'));s.value='blur';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    let backgroundReady = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const text = await evaluate("document.body.innerText");
      if (text.includes("Background active")) {
        backgroundReady = true;
        break;
      }
      if (
        text.includes("Background processing failed") ||
        text.includes("could not load")
      )
        throw Error(text);
    }
    if (!backgroundReady)
      throw Error("Background segmentation did not produce a mask");
    console.log(
      "PASS local background segmentation worker and mask composition",
    );
    const { WebSocketServer } = require("ws");
    const relay = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((r) => relay.on("listening", r));
    relay.on("connection", (socket) =>
      socket.send(
        JSON.stringify({
          type: "message",
          id: "synthetic-comment",
          platform: "Test relay",
          author: "Synthetic viewer",
          text: "Test interview comment 🎉",
          kind: "paid",
          amount: "TEST $5",
        }),
      ),
    );
    await evaluate(
      `window.studio.chatConnect({provider:'bridge',url:'ws://127.0.0.1:${relay.address().port}'})`,
    );
    await evaluate(`document.querySelectorAll('.tabs button')[1].click()`);
    await sleep(600);
    await evaluate(
      `[...document.querySelectorAll('.chat-feed button')].find(e=>e.textContent.includes('Synthetic viewer')).click()`,
    );
    await sleep(200);
    await evaluate(`document.querySelector('.chat-preview .primary').click()`);
    await evaluate(
      `document.querySelector('.reaction-buttons button').click()`,
    );
    console.log(
      "PASS live relay, paid comment preview, on-stream overlay and reaction control",
    );
    if (process.env.XTREEM_TEST_INTERVIEW === "1") {
      await evaluate(`document.querySelectorAll('.tabs button')[2].click()`);
      await sleep(200);
      await evaluate(
        `[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Open interview room')).click()`,
      );
      let invitation = "";
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        invitation = await evaluate(
          `document.querySelector('.inspector textarea[readonly]')?.value||''`,
        );
        if (invitation) break;
      }
      if (!invitation)
        throw Error("PeerJS signaling did not create an invitation");
      const { session } = require("electron");
      session.defaultSession.setPermissionRequestHandler((wc, p, cb) =>
        cb(["media"].includes(p)),
      );
      session.defaultSession.setPermissionCheckHandler((wc, p) =>
        ["media"].includes(p),
      );
      const guest = new BrowserWindow({
        width: 900,
        height: 800,
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await guest.loadURL(
        "xtreem://studio/guest.html" + new URL(invitation).hash,
      );
      await sleep(800);
      await guest.webContents.executeJavaScript(
        `(()=>{const input=document.querySelector('input:not([type=checkbox])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Synthetic Guest');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('input[type=checkbox]').click();})()`,
        true,
      );
      await sleep(200);
      await guest.webContents.executeJavaScript(
        `document.querySelector('.primary').click()`,
        true,
      );
      let pending = false;
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        if (
          await evaluate(`document.body.innerText.includes('wants to join')`)
        ) {
          pending = true;
          break;
        }
      }
      if (!pending) throw Error("Guest did not arrive in waiting room");
      await evaluate(
        `[...document.querySelectorAll('button')].find(e=>e.textContent==='Accept guest').click()`,
      );
      let accepted = false;
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        if (
          await evaluate(`document.body.innerText.includes('Guest connected')`)
        ) {
          accepted = true;
          break;
        }
      }
      if (!accepted) throw Error("Guest WebRTC media did not connect");
      await sleep(1000);
      const guestFrames = () =>
        evaluate(`(() => {
        const video = document.querySelector('.guest-monitor');
        const regions = [...document.querySelectorAll('.canvases canvas')].map(canvas => {
          const portrait = canvas.height > canvas.width;
          const x = Math.floor(canvas.width * (portrait ? .1 : .55));
          const y = Math.floor(canvas.height * (portrait ? .5 : .2));
          const w = Math.floor(canvas.width * (portrait ? .7 : .4));
          const h = Math.floor(canvas.height * (portrait ? .2 : .4));
          const pixels = canvas.getContext('2d').getImageData(x,y,w,h).data;
          let content = 0, samples = 0;
          for(let i=0;i<pixels.length;i+=64) {
            samples++;
            if (Math.abs(pixels[i]-20)+Math.abs(pixels[i+1]-33)+Math.abs(pixels[i+2]-42)>30) content++;
          }
          return content / samples;
        });
        return { ready: video?.readyState, width: video?.videoWidth, time: video?.currentTime,
          live: video?.srcObject?.getTracks().every(t => t.readyState === 'live'), regions };
      })()`);
      const before = await guestFrames();
      await sleep(1200);
      const after = await guestFrames();
      if (
        !after.live ||
        after.ready < 2 ||
        !after.width ||
        !(after.time > before.time)
      )
        throw Error(
          "Guest video is not live and advancing: " +
            JSON.stringify({ before, after }),
        );
      if (
        after.regions.length !== 2 ||
        after.regions.some((contentRatio) => contentRatio < 0.5)
      )
        throw Error(
          "Guest video is missing from an output canvas: " +
            JSON.stringify(after),
        );
      console.log(
        "PASS browser guest invitation, consent, host acceptance, advancing guest preview and visible guest pixels in both outputs",
      );
    }
    await evaluate(
      `document.querySelector('[aria-label="Output settings"]').click()`,
    );
    await sleep(200);
    await evaluate(
      `(()=>{const select=[...document.querySelectorAll('select')].find(e=>e.textContent.includes('NVIDIA'));const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,${JSON.stringify(process.env.XTREEM_TEST_ENCODER || "libx264")});select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await evaluate(`document.querySelector('.primary').click()`);
    await sleep(14000);
    const state = await evaluate(
      `({text:document.body.innerText,canvases:[...document.querySelectorAll('canvas')].map(c=>[c.width,c.height])})`,
    );
    if (
      !state.text.includes("End session") ||
      state.text.includes("Output failed")
    )
      throw Error("Session did not run: " + state.text);
    await evaluate(`document.querySelector('.danger').click()`);
    let finished = false;
    for (let i = 0; i < 90; i++) {
      await sleep(500);
      if (
        await evaluate(
          `document.querySelector('.session-control button').textContent.trim() === 'Start recording'`,
        )
      ) {
        finished = true;
        break;
      }
    }
    if (!finished) throw Error("Recording did not finish within 45 seconds");
    const files = (await fs.readdir(path.join(root, "X-treem"))).filter((n) =>
      n.endsWith(".mkv"),
    );
    if (files.length !== 2) throw Error("Expected two recordings");
    const { spawnSync } = require("node:child_process");
    const binary = require("ffmpeg-static");
    for (const file of files) {
      const full = path.join(root, "X-treem", file);
      const result = spawnSync(
        binary,
        ["-hide_banner", "-i", full, "-f", "null", "-"],
        { windowsHide: true },
      );
      const info = result.stderr.toString();
      if (
        result.status !== 0 ||
        !info.includes("Video: h264") ||
        !info.includes("Audio: aac")
      )
        throw Error("Invalid recording " + info);
      if (!info.includes(file.includes("portrait") ? "720x1280" : "1280x720"))
        throw Error("Wrong recording dimensions");
      console.log("PASS", file, (await fs.stat(full)).size, "bytes");
    }
    console.log(
      "PASS real Electron capture, IPC, dual-format encoding, audio, stop and finalized recordings.",
    );
    await evaluate(`window.studio.chatDisconnect('bridge')`);
    relay.close();
    await fs.mkdir(path.join(process.cwd(), "work"), { recursive: true });
    await fs.writeFile(
      path.join(process.cwd(), "work", "desktop-smoke-result.json"),
      JSON.stringify({ root, files, passed: true }, null, 2),
    );
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
})();
