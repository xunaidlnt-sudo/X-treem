import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Radio,
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  Settings2,
  Palette,
  Layers,
  Plus,
  Trash2,
  FolderOpen,
  Check,
  ChevronRight,
  Square,
  Activity,
  Monitor,
  Smartphone,
  Volume2,
  Save,
  X,
  Clapperboard,
  ArrowUpRight,
  ShieldCheck,
  Cpu,
  MessageSquare,
  Users,
  WandSparkles,
} from "lucide-react";
import { StudioMedia } from "./media";
import { ChatPanel } from "./ChatPanel";
import { GuestPanel } from "./GuestPanel";
import { BackgroundPanel } from "./BackgroundPanel";
import "./style.css";
import "./additions.css";
const defaults = {
  encoder: "auto",
  resolution: 720,
  fps: 30,
  bitrate: 4500,
  orientations: ["landscape", "portrait"],
  record: true,
  destinations: [],
  scene: "slate",
  title: "Welcome to the stream",
  subtitle: "Live from X-treem Studio",
  lowerThird: false,
  ticker: "",
  slate: "Something good is about to begin",
  logo: true,
  accent: "#b5f060",
  enhance: true,
  volume: 85,
  muted: false,
  backgroundMode: "off",
  backgroundColor: "#203b43",
  backgroundImage: "",
  activeComment: null,
  autoReactions: false,
  guestVolume: 100,
  guestMuted: false,
};
const encoderNames = {
  auto: "Auto · best available",
  h264_nvenc: "NVIDIA NVENC",
  h264_qsv: "Intel Quick Sync",
  h264_amf: "AMD AMF",
  libx264: "Software · CPU",
};
const scenes = [
  {
    id: "interview",
    name: "Interview",
    description: "Two voices, one stage",
    icon: Users,
  },
  {
    id: "slate",
    name: "Starting soon",
    description: "Set the mood",
    icon: Clapperboard,
  },
  {
    id: "camera",
    name: "Camera",
    description: "You, front and center",
    icon: Video,
  },
  {
    id: "pip",
    name: "Screen + you",
    description: "Share your perspective",
    icon: Layers,
  },
  {
    id: "screen",
    name: "Screen only",
    description: "Make room for the details",
    icon: Monitor,
  },
];
function App() {
  const [config, setConfig] = useState(defaults),
    [tab, setTab] = useState("destinations"),
    [devices, setDevices] = useState([]),
    [camera, setCamera] = useState(false),
    [mic, setMic] = useState(false),
    [screen, setScreen] = useState(false),
    [hardware, setHardware] = useState(null),
    [sources, setSources] = useState(null),
    [phase, setPhase] = useState("idle"),
    [status, setStatus] = useState({}),
    [message, setMessage] = useState(""),
    [level, setLevel] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [sessionInfo, setSessionInfo] = useState(null),
    [saved, setSaved] = useState(false),
    [cameraId, setCameraId] = useState(""),
    [micId, setMicId] = useState(""),
    [speakerId, setSpeakerId] = useState(""),
    [deviceDialog, setDeviceDialog] = useState(false),
    [deviceLoading, setDeviceLoading] = useState(false),
    [backgroundStatus, setBackgroundStatus] = useState(""),
    [roomOpen, setRoomOpen] = useState(false);
  const landscape = useRef(),
    portrait = useRef(),
    media = useRef(),
    phaseRef = useRef("idle");
  const busy = phase !== "idle";
  const change = (key, value) => {
    setSaved(false);
    setConfig((c) => ({ ...c, [key]: value }));
  };
  useEffect(() => {
    const m = new StudioMedia();
    media.current = m;
    m.mount(landscape.current, portrait.current);
    m.onScreenEnd = () => setScreen(false);
    m.onBackgroundStatus = setBackgroundStatus;
    let active = true;
    window.studio
      ?.load()
      .then((c) => {
        if (active && c) {
          setConfig({ ...defaults, ...c, activeComment: null });
          setCameraId(c.cameraDeviceId || "");
          setMicId(c.micDeviceId || "");
          setSpeakerId(c.speakerDeviceId || "");
        }
      })
      .catch(() => setMessage("Saved settings could not be loaded."));
    window.studio
      ?.hardware()
      .then((h) => active && setHardware(h))
      .catch(() =>
        setMessage("Hardware detection failed. Try software encoding."),
      );
    const unsub = window.studio?.onStatus((s) => {
      setStatus((old) => ({ ...old, [s.orientation]: s }));
      if (s.state === "error") {
        setMessage(s.message);
        void stop();
      }
    });
    const interval = setInterval(() => setLevel(m.level), 100);
    return () => {
      active = false;
      unsub?.();
      clearInterval(interval);
      m.dispose();
    };
  }, []);
  useEffect(() => {
    const refresh = () =>
      navigator.mediaDevices
        ?.enumerateDevices()
        .then(setDevices)
        .catch(() => {});
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, []);
  useEffect(() => {
    media.current?.setSpeaker(speakerId).catch((e) => setMessage(e.message));
  }, [speakerId]);
  useEffect(() => {
    media.current?.update(config);
  }, [config]);
  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== "running") return;
    const start = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [phase]);
  const act = async (fn) => {
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.message || "Something went wrong. Please try again.");
    }
  };
  const refreshDevices = async () =>
    setDevices(await navigator.mediaDevices.enumerateDevices());
  const detectDevices = () =>
    act(async () => {
      setDeviceLoading(true);
      try {
        const results = await Promise.allSettled([
          media.current.enableCamera(cameraId),
          media.current.enableMic(micId),
        ]);
        if (results[0].status === "fulfilled") setCamera(true);
        if (results[1].status === "fulfilled") setMic(true);
        await refreshDevices();
        if (results.some((r) => r.status === "rejected"))
          setMessage(
            "Some devices could not be opened. Check Windows privacy permissions and whether another app is using the camera or microphone.",
          );
      } finally {
        setDeviceLoading(false);
      }
    });
  const toggleCamera = () =>
    act(async () => {
      if (camera) {
        media.current.disable("camera");
        setCamera(false);
      } else {
        await media.current.enableCamera(cameraId);
        setCamera(true);
        if (config.scene === "slate") change("scene", "camera");
        await refreshDevices();
      }
    });
  const toggleMic = () =>
    act(async () => {
      if (mic) {
        media.current.disable("mic");
        setMic(false);
      } else {
        await media.current.enableMic(micId);
        setMic(true);
        await refreshDevices();
      }
    });
  const share = () =>
    act(async () => {
      if (screen) {
        media.current.disable("screen");
        setScreen(false);
      } else if (window.studio) setSources(await window.studio.sources());
      else {
        await media.current.share();
        setScreen(true);
        change("scene", "pip");
      }
    });
  const stop = async () => {
    if (phaseRef.current === "stopping") return;
    setPhase("stopping");
    phaseRef.current = "stopping";
    try {
      await media.current.stop();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setPhase("idle");
      phaseRef.current = "idle";
    }
  };
  const start = () =>
    act(async () => {
      if (!window.studio)
        throw Error(
          "Streaming and recording are available in the Windows desktop app. This browser is an interface preview.",
        );
      setPhase("starting");
      phaseRef.current = "starting";
      setStatus({});
      setElapsed(0);
      try {
        const info = await media.current.start(config, (error) => {
          setMessage(error);
          void stop();
        });
        setSessionInfo(info);
        setPhase("running");
        phaseRef.current = "running";
      } catch (e) {
        setPhase("idle");
        phaseRef.current = "idle";
        throw e;
      }
    });
  const addDestination = () =>
    change("destinations", [
      ...config.destinations,
      {
        id: crypto.randomUUID(),
        name: "YouTube",
        url: "rtmps://a.rtmps.youtube.com:443/live2",
        key: "",
        orientation: "landscape",
        enabled: true,
      },
    ]);
  const updateDestination = (id, key, value) =>
    change(
      "destinations",
      config.destinations.map((d) =>
        d.id === id ? { ...d, [key]: value } : d,
      ),
    );
  const save = () =>
    act(async () => {
      if (!window.studio)
        throw Error("Install the desktop app to securely save your settings.");
      await window.studio.save({
        ...config,
        activeComment: null,
        cameraDeviceId: cameraId,
        micDeviceId: micId,
        speakerDeviceId: speakerId,
      });
      setSaved(true);
    });
  const outputState = (o) =>
    !busy
      ? "Preview"
      : status[o]?.state === "error"
        ? "Output failed"
        : status[o]?.frames > 0
          ? "Encoding"
          : busy
            ? "Starting"
            : "Preview";
  const size =
    config.resolution === 1080 ? { w: 1920, h: 1080 } : { w: 1280, h: 720 };
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand-symbol">
          x<span>•</span>
        </div>
        <button
          className="rail-button active"
          aria-label="Studio"
          title="Studio"
        >
          <Radio size={22} />
        </button>
        <button
          className="rail-button"
          aria-label="Output settings"
          title="Output settings"
          onClick={() => setTab("settings")}
        >
          <Settings2 size={22} />
        </button>
        <button
          className="rail-button"
          aria-label="Open recordings"
          title="Open recordings"
          onClick={() =>
            act(async () => {
              if (!window.studio)
                throw Error("Recordings are available in the desktop app.");
              await window.studio.recordings();
            })
          }
        >
          <FolderOpen size={22} />
        </button>
        <div className="rail-bottom">
          <span className="version">0.1</span>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="wordmark">
            X-treem <span>STUDIO</span>
          </div>
          <div className="header-right">
            <span className="local-badge">
              <span className="dot" />{" "}
              {window.studio ? "Local studio" : "Browser preview"}
            </span>
            <button className="secondary" onClick={save}>
              <Save size={15} />
              {saved ? "Saved" : "Save studio"}
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR STAGE. EVERY SCREEN.</div>
            <h1>
              Let’s make it live<span>.</span>
            </h1>
            <p>One studio. Two formats. All your audiences.</p>
          </div>
          <div className="session-control">
            <div className="session-status">
              <span className={busy ? "dot live" : "dot"} />
              {busy
                ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
                : "Ready when you are"}
              <small>{busy ? "Session active" : "PRIVATE PREVIEW"}</small>
            </div>
            <button
              className={busy ? "danger" : "primary"}
              disabled={phase === "starting" || phase === "stopping"}
              onClick={busy ? stop : start}
            >
              {busy ? <Square size={16} /> : <Radio size={18} />}{" "}
              {phase === "starting"
                ? "Starting…"
                : phase === "stopping"
                  ? "Finishing…"
                  : busy
                    ? "End session"
                    : config.destinations.some((d) => d.enabled)
                      ? "Go live"
                      : "Start recording"}
            </button>
          </div>
        </div>
        {message && (
          <div className="alert" role="alert">
            <Activity size={18} />
            <span>{message}</span>
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X size={17} />
            </button>
          </div>
        )}
        <div className="studio-grid">
          <main>
            <section className="preview-panel">
              <div className="section-heading">
                <h2>
                  <Monitor size={17} />
                  Program preview
                </h2>
                <span className="chip">DUAL CANVAS</span>
              </div>
              <div className="canvases">
                <div
                  className={`canvas-wrap landscape ${!config.orientations.includes("landscape") ? "output-off" : ""}`}
                >
                  <div className="canvas-label">
                    <span>
                      <Monitor size={13} />
                      Landscape
                    </span>
                    <span>16:9</span>
                  </div>
                  <canvas
                    ref={landscape}
                    width={size.w}
                    height={size.h}
                    aria-label="Landscape program preview"
                  />
                  <div className="canvas-meta">
                    <span
                      className={
                        status.landscape?.state === "error" ? "error-text" : ""
                      }
                    >
                      <i />
                      {outputState("landscape")}
                    </span>
                    <span>
                      {size.w} × {size.h}
                    </span>
                  </div>
                </div>
                <div
                  className={`canvas-wrap portrait ${!config.orientations.includes("portrait") ? "output-off" : ""}`}
                >
                  <div className="canvas-label">
                    <span>
                      <Smartphone size={13} />
                      Portrait
                    </span>
                    <span>9:16</span>
                  </div>
                  <canvas
                    ref={portrait}
                    width={size.h}
                    height={size.w}
                    aria-label="Portrait program preview"
                  />
                  <div className="canvas-meta">
                    <span
                      className={
                        status.portrait?.state === "error" ? "error-text" : ""
                      }
                    >
                      <i />
                      {outputState("portrait")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="capture-controls">
                <button
                  className={camera ? "control enabled" : "control"}
                  onClick={toggleCamera}
                >
                  {camera ? <Video size={19} /> : <VideoOff size={19} />}
                  <span>{camera ? "Camera on" : "Add camera"}</span>
                </button>
                <button
                  className={mic ? "control enabled" : "control"}
                  onClick={toggleMic}
                >
                  {mic ? <Mic size={19} /> : <MicOff size={19} />}
                  <span>{mic ? "Mic on" : "Add microphone"}</span>
                </button>
                <span className="control-divider" />
                <button
                  className="control devices-control"
                  onClick={() => {
                    setDeviceDialog(true);
                    void act(refreshDevices);
                  }}
                >
                  <Settings2 size={19} />
                  <span>Devices</span>
                </button>
                <button
                  className={screen ? "control enabled" : "control"}
                  onClick={share}
                >
                  <MonitorUp size={19} />
                  <span>{screen ? "Stop sharing" : "Share screen"}</span>
                </button>
                <span className="controls-note">
                  <ShieldCheck size={14} />
                  {roomOpen
                    ? "Guest room is open"
                    : "Preview stays private until you go live"}
                </span>
              </div>
            </section>
            <section className="scenes-section">
              <div className="section-heading">
                <h2>Scenes</h2>
                <span className="muted">Switch your story in one click</span>
              </div>
              <div className="scenes">
                {scenes.map(({ id, name, description, icon: Icon }, i) => (
                  <button
                    key={id}
                    onClick={() => change("scene", id)}
                    className={`scene ${config.scene === id ? "selected" : ""}`}
                  >
                    <div className={`scene-art scene-${id}`}>
                      <Icon size={28} />
                      <span className="scene-number">0{i + 1}</span>
                      {config.scene === id && (
                        <span className="scene-check">
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <strong>{name}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="audio-panel">
              <div>
                <h2>
                  <Volume2 size={17} />
                  Audio mixer
                </h2>
                <p>
                  {mic
                    ? "Microphone connected"
                    : "Add a microphone to bring your voice in"}
                </p>
              </div>
              <div className="audio-meter" aria-label="Microphone level">
                <div style={{ width: `${level * 100}%` }} />
              </div>
              <button
                className="icon-button"
                aria-label={
                  config.muted ? "Unmute microphone" : "Mute microphone"
                }
                onClick={() => change("muted", !config.muted)}
              >
                {config.muted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <input
                aria-label="Microphone volume"
                type="range"
                min="0"
                max="150"
                value={config.volume}
                onChange={(e) => change("volume", +e.target.value)}
              />
              <span className="volume-value">{config.volume}%</span>
            </section>
            <div className="studio-footer">
              <span>
                <Cpu size={14} />
                {sessionInfo && busy
                  ? encoderNames[sessionInfo.encoder]
                  : hardware
                    ? `${hardware.encoders.filter((e) => e.available && e.name !== "libx264").length} GPU encoders available`
                    : "Hardware detection in desktop app"}
              </span>
              <span>
                {config.fps} FPS <b>·</b> {config.bitrate / 1000} Mbps per
                format <b>·</b> H.264 + AAC
              </span>
            </div>
          </main>
          <aside className="inspector">
            <div className="tabs">
              {[
                ["destinations", "Destinations", Radio],
                ["chat", "Comments", MessageSquare],
                ["guests", "Guests", Users],
                ["brand", "Brand", Palette],
                ["background", "Background", WandSparkles],
                ["settings", "Settings", Settings2],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="inspector-content">
              <ChatPanel
                hidden={tab !== "chat"}
                config={config}
                change={change}
                media={media}
                onError={setMessage}
              />
              <GuestPanel
                hidden={tab !== "guests"}
                config={config}
                change={change}
                media={media}
                onError={setMessage}
                onRoomState={setRoomOpen}
              />
              {tab === "background" && (
                <BackgroundPanel
                  config={config}
                  change={change}
                  status={backgroundStatus}
                  onError={setMessage}
                />
              )}
              {tab === "destinations" && (
                <>
                  <div className="inspector-heading">
                    <div className="eyebrow">REACH EVERYONE</div>
                    <h2>Your destinations</h2>
                    <p>Send each format to the right audience.</p>
                  </div>
                  <fieldset disabled={busy}>
                    <div className="format-options">
                      {["landscape", "portrait"].map((o) => (
                        <label
                          key={o}
                          className={
                            config.orientations.includes(o)
                              ? "format selected"
                              : "format"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={config.orientations.includes(o)}
                            onChange={(e) =>
                              change(
                                "orientations",
                                e.target.checked
                                  ? [...config.orientations, o]
                                  : config.orientations.filter((x) => x !== o),
                              )
                            }
                          />
                          {o === "landscape" ? (
                            <Monitor size={20} />
                          ) : (
                            <Smartphone size={20} />
                          )}
                          <strong>
                            {o === "landscape" ? "Landscape" : "Portrait"}
                          </strong>
                          <small>
                            {o === "landscape"
                              ? "16:9 · Wide"
                              : "9:16 · Vertical"}
                          </small>
                        </label>
                      ))}
                    </div>
                    {!config.destinations.length ? (
                      <div className="empty-dest">
                        <div className="orbit-icon">
                          <Radio size={25} />
                        </div>
                        <h3>A bigger stage awaits</h3>
                        <p>
                          Connect YouTube, Twitch, Facebook or any RTMP
                          destination.
                        </p>
                        <button className="secondary" onClick={addDestination}>
                          <Plus size={16} />
                          Add destination
                        </button>
                      </div>
                    ) : (
                      <div className="destination-list">
                        {config.destinations.map((d) => (
                          <div className="destination" key={d.id}>
                            <div className="destination-top">
                              <label className="inline">
                                <input
                                  type="checkbox"
                                  checked={d.enabled}
                                  onChange={(e) =>
                                    updateDestination(
                                      d.id,
                                      "enabled",
                                      e.target.checked,
                                    )
                                  }
                                />
                                Enabled
                              </label>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${d.name}`}
                                onClick={() =>
                                  change(
                                    "destinations",
                                    config.destinations.filter(
                                      (x) => x.id !== d.id,
                                    ),
                                  )
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <label>
                              Name
                              <input
                                value={d.name}
                                maxLength={80}
                                onChange={(e) =>
                                  updateDestination(
                                    d.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Server URL
                              <input
                                value={d.url}
                                placeholder="rtmps://server/live"
                                onChange={(e) =>
                                  updateDestination(d.id, "url", e.target.value)
                                }
                              />
                            </label>
                            <label>
                              Stream key
                              <input
                                type="password"
                                autoComplete="off"
                                value={d.key}
                                placeholder="Paste your private stream key"
                                onChange={(e) =>
                                  updateDestination(d.id, "key", e.target.value)
                                }
                              />
                            </label>
                            <label>
                              Format
                              <select
                                value={d.orientation}
                                onChange={(e) =>
                                  updateDestination(
                                    d.id,
                                    "orientation",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="landscape">
                                  Landscape · 16:9
                                </option>
                                <option value="portrait">
                                  Portrait · 9:16
                                </option>
                              </select>
                            </label>
                          </div>
                        ))}
                        <button
                          className="add-button"
                          disabled={config.destinations.length >= 8}
                          onClick={addDestination}
                        >
                          <Plus size={16} />
                          Add destination
                        </button>
                      </div>
                    )}
                    <div className="record-card">
                      <FolderOpen size={20} />
                      <div>
                        <strong>Keep a local copy</strong>
                        <p>Save each format as an MKV video.</p>
                      </div>
                      <input
                        type="checkbox"
                        aria-label="Local recording"
                        checked={config.record}
                        onChange={(e) => change("record", e.target.checked)}
                      />
                    </div>
                  </fieldset>
                  <div className="tip">
                    <ShieldCheck size={17} />
                    <p>
                      Stream keys stay on this computer, encrypted when you save
                      your studio.
                    </p>
                  </div>
                  {sessionInfo && !busy && (
                    <button
                      className="add-button"
                      onClick={() => act(() => window.studio.recordings())}
                    >
                      <FolderOpen size={16} />
                      Open recordings
                    </button>
                  )}
                </>
              )}
              {tab === "brand" && (
                <>
                  <div className="inspector-heading">
                    <div className="eyebrow">MAKE IT YOURS</div>
                    <h2>A little personality</h2>
                    <p>Your branding, on both canvases.</p>
                  </div>
                  <label>
                    Accent color
                    <div className="color-row">
                      <input
                        type="color"
                        value={config.accent}
                        onChange={(e) => change("accent", e.target.value)}
                      />
                      <span>{config.accent.toUpperCase()}</span>
                    </div>
                  </label>
                  <label className="toggle-row">
                    Show studio badge
                    <input
                      type="checkbox"
                      checked={config.logo}
                      onChange={(e) => change("logo", e.target.checked)}
                    />
                  </label>
                  <label className="toggle-row">
                    Show lower third
                    <input
                      type="checkbox"
                      checked={config.lowerThird}
                      onChange={(e) => change("lowerThird", e.target.checked)}
                    />
                  </label>
                  <label>
                    On-screen title
                    <input
                      value={config.title}
                      maxLength={48}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  </label>
                  <label>
                    Subtitle
                    <input
                      value={config.subtitle}
                      maxLength={64}
                      onChange={(e) => change("subtitle", e.target.value)}
                    />
                  </label>
                  <label>
                    Scrolling ticker
                    <textarea
                      rows="3"
                      value={config.ticker}
                      maxLength={250}
                      placeholder="An announcement, a link, a little hello…"
                      onChange={(e) => change("ticker", e.target.value)}
                    />
                  </label>
                  <label>
                    Starting soon message
                    <input
                      value={config.slate}
                      maxLength={45}
                      onChange={(e) => change("slate", e.target.value)}
                    />
                  </label>
                  <div className="tip">
                    <Palette size={17} />
                    <p>
                      Changes appear immediately in the previews and your active
                      outputs.
                    </p>
                  </div>
                </>
              )}
              {tab === "settings" && (
                <>
                  <div className="inspector-heading">
                    <div className="eyebrow">BUILT FOR YOUR MACHINE</div>
                    <h2>Quality, made simple</h2>
                    <p>Balance a crisp picture with smooth delivery.</p>
                  </div>
                  <fieldset disabled={busy}>
                    <label>
                      Video encoder
                      <select
                        value={config.encoder}
                        onChange={(e) => change("encoder", e.target.value)}
                      >
                        {Object.entries(encoderNames).map(([id, name]) => (
                          <option
                            key={id}
                            value={id}
                            disabled={
                              id !== "auto" &&
                              hardware &&
                              !hardware.encoders.find((e) => e.name === id)
                                ?.available
                            }
                          >
                            {name}
                            {id !== "auto" &&
                            hardware &&
                            !hardware.encoders.find((e) => e.name === id)
                              ?.available
                              ? " · unavailable"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="field-pair">
                      <label>
                        Resolution
                        <select
                          value={config.resolution}
                          onChange={(e) =>
                            change("resolution", +e.target.value)
                          }
                        >
                          <option value={720}>HD · 720p</option>
                          <option value={1080}>Full HD · 1080p</option>
                        </select>
                      </label>
                      <label>
                        Frame rate
                        <select
                          value={config.fps}
                          onChange={(e) => change("fps", +e.target.value)}
                        >
                          {[24, 30, 60].map((n) => (
                            <option key={n} value={n}>
                              {n} fps
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Bitrate per format · {config.bitrate} Kbps
                      <input
                        type="range"
                        min="1500"
                        max="20000"
                        step="500"
                        value={config.bitrate}
                        onChange={(e) => change("bitrate", +e.target.value)}
                      />
                    </label>
                    <p className="help">
                      Each destination uses upload bandwidth. Allow at least{" "}
                      {Math.ceil(
                        (config.bitrate *
                          Math.max(
                            1,
                            config.destinations.filter((d) => d.enabled).length,
                          ) *
                          1.3) /
                          1000,
                      )}{" "}
                      Mbps upload for these settings.
                    </p>
                  </fieldset>
                  <label className="toggle-row">
                    Gentle color enhancement
                    <input
                      type="checkbox"
                      checked={config.enhance}
                      onChange={(e) => change("enhance", e.target.checked)}
                    />
                  </label>
                  <div className="feature-note">
                    <Check size={15} />
                    Microphone noise suppression and echo cancellation requested
                    automatically; device support varies.
                  </div>
                  <label>
                    Camera
                    <select
                      value={cameraId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setCameraId(id);
                        if (camera) act(() => media.current.enableCamera(id));
                      }}
                    >
                      <option value="">System default</option>
                      {devices
                        .filter((d) => d.kind === "videoinput")
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || "Camera"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Microphone
                    <select
                      value={micId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setMicId(id);
                        if (mic) act(() => media.current.enableMic(id));
                      }}
                    >
                      <option value="">System default</option>
                      {devices
                        .filter((d) => d.kind === "audioinput")
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || "Microphone"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="tip">
                    <Cpu size={17} />
                    <p>
                      Auto tests your GPU encoders and selects one that works.
                      Software encoding is the fallback. Capture and composition
                      also use CPU resources.
                    </p>
                  </div>
                  <p className="help">
                    v0.1 · Local production studio. Cloud scheduling and guest
                    ISO recordings are not included.
                  </p>
                </>
              )}
            </div>
            <div className="inspector-bottom">
              <span className="dot" />
              Made for your next great stream
              <ArrowUpRight size={14} />
            </div>
          </aside>
        </div>
      </div>
      {deviceDialog && (
        <div className="modal-backdrop">
          <section
            className="modal device-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Camera and audio devices"
          >
            <div className="section-heading">
              <h2>
                <Settings2 size={18} />
                Camera & audio devices
              </h2>
              <button
                className="icon-button"
                aria-label="Close device settings"
                onClick={() => setDeviceDialog(false)}
              >
                <X />
              </button>
            </div>
            <p>
              Choose your camera, microphone and the speakers used to hear your
              guest. Your selections are saved with Save studio.
            </p>
            <div className="device-fields">
              <label>
                Camera device
                <select
                  value={cameraId}
                  onChange={(e) => {
                    setCameraId(e.target.value);
                    setSaved(false);
                    if (camera)
                      void act(() =>
                        media.current.enableCamera(e.target.value),
                      );
                  }}
                >
                  <option value="">System default camera</option>
                  {devices
                    .filter((d) => d.kind === "videoinput")
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Microphone device
                <select
                  value={micId}
                  onChange={(e) => {
                    setMicId(e.target.value);
                    setSaved(false);
                    if (mic)
                      void act(() => media.current.enableMic(e.target.value));
                  }}
                >
                  <option value="">System default microphone</option>
                  {devices
                    .filter((d) => d.kind === "audioinput")
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Speaker / headphone device
                <select
                  value={speakerId}
                  onChange={(e) => {
                    setSpeakerId(e.target.value);
                    setSaved(false);
                  }}
                >
                  <option value="">System default speakers</option>
                  {devices
                    .filter((d) => d.kind === "audiooutput")
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
              <div className="device-status">
                <span>{camera ? "Camera connected" : "Camera off"}</span>
                <span>{mic ? "Microphone connected" : "Microphone off"}</span>
              </div>
              <div className="button-pair">
                <button
                  className="primary"
                  disabled={deviceLoading}
                  onClick={detectDevices}
                >
                  {deviceLoading ? "Detecting…" : "Enable & detect devices"}
                </button>
                <button
                  className="secondary"
                  onClick={() => act(refreshDevices)}
                >
                  Refresh device list
                </button>
                <button
                  className="secondary"
                  onClick={() => act(() => media.current.testSpeaker())}
                >
                  Test speakers
                </button>
              </div>
              <p className="help">
                Enable & detect requests camera and microphone access and turns
                them on in your private preview. Use headphones for guest
                interviews. Speaker testing plays a short local tone and is not
                added to the broadcast.
              </p>
            </div>
          </section>
        </div>
      )}
      {sources && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a screen or window"
          >
            <div className="section-heading">
              <h2>Choose what to share</h2>
              <button
                className="icon-button"
                aria-label="Close source picker"
                onClick={() => setSources(null)}
              >
                <X />
              </button>
            </div>
            <p>
              Only the selected screen or window will be captured. System audio
              is not included.
            </p>
            <div className="source-grid">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    act(async () => {
                      await media.current.share(s.id);
                      setScreen(true);
                      change("scene", "pip");
                      setSources(null);
                    })
                  }
                >
                  <img src={s.thumbnail} alt="" />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
