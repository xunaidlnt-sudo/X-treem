import React, { useEffect, useState } from "react";
export function ShowPanel({ media, config, change, scenes, onError }) {
  const [timer, setTimer] = useState({ state: "idle", text: "00:00" });
  useEffect(() => {
    const id = setInterval(() => setTimer(media.current.countdown.read()), 200);
    return () => clearInterval(id);
  }, []);
  const save = async (orientation) => {
    try {
      if (!window.studio)
        throw Error("Save snapshots from the installed Windows app.");
      const result = await window.studio.snapshot(
        orientation,
        media.current.canvases[orientation].toDataURL("image/png"),
      );
      if (result) onError("Snapshot saved: " + result);
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <>
      <div className="inspector-heading">
        <div className="eyebrow">RUN YOUR SHOW</div>
        <h2>Show controls</h2>
        <p>Prepare the opening, then switch scenes with confidence.</p>
      </div>
      <label>
        Countdown seconds
        <input
          aria-label="Countdown seconds"
          type="number"
          min="1"
          max="3600"
          value={config.countdownSeconds}
          onChange={(e) => change("countdownSeconds", Number(e.target.value))}
        />
      </label>
      <label>
        Scene after countdown
        <select
          aria-label="Scene after countdown"
          value={config.countdownScene}
          onChange={(e) => change("countdownScene", e.target.value)}
        >
          {scenes
            .filter((s) => s.id !== "slate")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <output className="countdown-readout" aria-label="Countdown remaining">
        {timer.text}
      </output>
      <div className="button-pair">
        <button
          className="primary"
          onClick={() => {
            try {
              media.current.countdown.start(
                config.countdownSeconds,
                config.countdownScene,
              );
              change("scene", "slate");
            } catch (e) {
              onError(e.message);
            }
          }}
        >
          {timer.state === "idle" ? "Start countdown" : "Restart countdown"}
        </button>
        {timer.state !== "idle" && (
          <>
            <button
              className="secondary"
              onClick={() =>
                timer.state === "paused"
                  ? media.current.countdown.resume()
                  : media.current.countdown.pause()
              }
            >
              {timer.state === "paused"
                ? "Resume countdown"
                : "Pause countdown"}
            </button>
            <button
              className="secondary"
              onClick={() => media.current.countdown.cancel()}
            >
              Cancel countdown
            </button>
          </>
        )}
      </div>
      <p className="help">
        Shows on the Starting soon scene in both outputs. Finishing changes the
        scene only; it never starts a broadcast. Switching scenes cancels the
        timer.
      </p>
      <h3>Save a preview image</h3>
      <div className="button-pair">
        {["landscape", "portrait"].map((o) => (
          <button className="secondary" key={o} onClick={() => save(o)}>
            Save {o} PNG
          </button>
        ))}
      </div>
      <p className="help">
        Saves the current composition, including comments and branding.
      </p>
      <h3>Keyboard shortcuts</h3>
      <p className="help">
        Ctrl + Alt + 1–6 switches scenes in the order shown. Ctrl + Shift + M
        mutes your microphone. Ctrl + Shift + G mutes the guest in the
        broadcast. Shortcuts work while the studio is focused and you are not
        typing or choosing a device.
      </p>
    </>
  );
}
