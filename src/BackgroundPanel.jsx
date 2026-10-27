import React from "react";
export function BackgroundPanel({ config, change, status, onError }) {
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      )
        throw Error("Choose a JPG, PNG or WebP image under 2 MB.");
      const url = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      change("backgroundImage", url);
      change("backgroundMode", "image");
    } catch (error) {
      onError(error.message);
    }
  };
  return (
    <>
      <div className="inspector-heading">
        <div className="eyebrow">YOUR SPACE, REIMAGINED</div>
        <h2>Camera background</h2>
        <p>Keep yourself in focus. Change everything behind you.</p>
      </div>
      <label>
        Background effect
        <select
          value={config.backgroundMode || "off"}
          onChange={(e) => change("backgroundMode", e.target.value)}
        >
          <option value="off">Original background</option>
          <option value="blur">Blur background</option>
          <option value="remove">Remove & replace with color</option>
          <option value="image">Replace with an image</option>
          <option value="animated">Animated studio background</option>
        </select>
      </label>
      <label>
        Background color
        <input
          type="color"
          value={config.backgroundColor || "#203b43"}
          onChange={(e) => change("backgroundColor", e.target.value)}
        />
      </label>
      <label>
        Upload background image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={upload}
        />
      </label>
      {config.backgroundImage && (
        <img
          className="background-thumb"
          src={config.backgroundImage}
          alt="Selected background"
        />
      )}
      <p className="connection-state">
        {config.backgroundMode === "off"
          ? "Original camera background"
          : status || "Add your camera to start the effect."}
      </p>
      <div className="tip">
        <p>
          Person detection runs locally in a worker, with GPU processing when
          available and CPU fallback. Camera frames are not sent to an AI
          service. Good lighting improves edges. The effect runs at a reduced
          resolution and frame rate to keep your stream responsive.
        </p>
      </div>
    </>
  );
}
