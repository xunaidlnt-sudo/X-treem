import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, Eye, Radio, Heart, X } from "lucide-react";
export function ChatPanel({ hidden, config, change, media, onError }) {
  const [messages, setMessages] = useState([]),
    [statuses, setStatuses] = useState({}),
    [provider, setProvider] = useState("youtube"),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState("all"),
    [connecting, setConnecting] = useState(false);
  const latest = useRef(config);
  latest.current = config;
  const settings = config["chat_" + provider] || {};
  const field = (key, value) =>
    change("chat_" + provider, { ...settings, [key]: value });
  useEffect(
    () =>
      window.studio?.onChat((event) => {
        if (event.type === "status") {
          setStatuses((s) => ({ ...s, [event.provider]: event }));
          return;
        }
        if (event.type === "reaction") {
          if (latest.current.autoReactions) media.current?.react(event.emoji);
          return;
        }
        if (event.type === "message") {
          setMessages((m) =>
            [...m.filter((x) => x.id !== event.id), event].slice(-300),
          );
          if (latest.current.autoReactions) {
            const emoji = ["❤️", "👏", "🔥", "😂", "👍", "🎉"].find((e) =>
              event.text.includes(e),
            );
            if (emoji) media.current?.react(emoji);
          }
          return;
        }
        const removed = (m) =>
          event.type === "delete"
            ? m.id === event.id
            : event.type === "ban"
              ? m.platform === event.platform && m.authorId === event.authorId
              : event.type === "clear"
                ? m.platform === event.platform
                : false;
        setMessages((m) => m.filter((x) => !removed(x)));
        setSelected((m) => (m && removed(m) ? null : m));
        if (
          latest.current.activeComment &&
          removed(latest.current.activeComment)
        )
          change("activeComment", null);
      }),
    [],
  );
  const connect = async () => {
    setConnecting(true);
    try {
      if (!window.studio)
        throw Error("Use the desktop app to connect live chat.");
      await window.studio.chatConnect({ provider, ...settings });
    } catch (e) {
      onError(e.message);
    } finally {
      setConnecting(false);
    }
  };
  const previewSample = () =>
    setSelected({
      id: "sample",
      sample: true,
      platform: "Preview",
      author: "Sample viewer",
      text: "Loving this conversation! Thanks for sharing your story. 🎉",
      kind: "paid",
      amount: "SAMPLE $5.00",
    });
  const connected = statuses[provider]?.state === "connected";
  return (
    <div hidden={hidden}>
      <div className="inspector-heading">
        <div className="eyebrow">BRING YOUR AUDIENCE IN</div>
        <h2>Live comments</h2>
        <p>Preview a message, then choose when it goes on screen.</p>
      </div>
      <label>
        Chat connection
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="youtube">YouTube · comments & Super Chat</option>
          <option value="twitch">Twitch · comments & Bits</option>
          <option value="bridge">Other platforms · chat relay</option>
        </select>
      </label>
      {provider === "youtube" && (
        <>
          <label>
            Live video URL or ID
            <input
              value={settings.videoId || ""}
              onChange={(e) => field("videoId", e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
            />
          </label>
          <label>
            YouTube Data API key
            <input
              type="password"
              autoComplete="off"
              value={settings.apiKey || ""}
              onChange={(e) => field("apiKey", e.target.value)}
            />
          </label>
          <p className="help">
            Requires an active live chat and an API key with YouTube Data API v3
            enabled. Polling uses your API quota.
          </p>
        </>
      )}
      {provider === "twitch" && (
        <>
          <label>
            Channel
            <input
              value={settings.channel || ""}
              onChange={(e) => field("channel", e.target.value)}
            />
          </label>
          <label>
            Twitch account username
            <input
              value={settings.username || ""}
              onChange={(e) => field("username", e.target.value)}
            />
          </label>
          <label>
            OAuth token · chat:read
            <input
              type="password"
              autoComplete="off"
              value={settings.token || ""}
              onChange={(e) => field("token", e.target.value)}
            />
          </label>
        </>
      )}
      {provider === "bridge" && (
        <>
          <label>
            Compatible chat relay URL
            <input
              value={settings.url || ""}
              onChange={(e) => field("url", e.target.value)}
              placeholder="wss://your-relay.example/chat"
            />
          </label>
          <label>
            Relay access token
            <input
              type="password"
              value={settings.token || ""}
              onChange={(e) => field("token", e.target.value)}
            />
          </label>
          <p className="help">
            Connect a relay that translates other platform APIs to X-treem's
            documented chat format. Facebook, Instagram, TikTok, Kick and other
            services need a compatible relay; native chat connectors are not
            included.
          </p>
        </>
      )}
      <div className="button-pair">
        <button className="secondary" onClick={connect} disabled={connecting}>
          {connecting
            ? "Connecting…"
            : connected
              ? "Reconnect"
              : "Connect chat"}
        </button>
        <button
          className="secondary"
          onClick={() => window.studio?.chatDisconnect(provider)}
        >
          Disconnect
        </button>
      </div>
      <p
        className={`connection-state ${statuses[provider]?.state === "error" ? "error-text" : ""}`}
      >
        {statuses[provider]?.message || "Not connected"}
      </p>
      <label className="toggle-row">
        Animate emojis from incoming chat
        <input
          type="checkbox"
          checked={!!config.autoReactions}
          onChange={(e) => change("autoReactions", e.target.checked)}
        />
      </label>
      <div className="reaction-buttons">
        {["❤️", "👏", "🔥", "😂", "👍", "🎉"].map((e) => (
          <button
            key={e}
            aria-label={`Show ${e} reaction`}
            onClick={() => media.current?.react(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <p className="help">
        Reaction buttons appear on both outputs. These are overlays, not
        platform reaction counts.
      </p>
      {config.activeComment && (
        <button
          className="add-button"
          onClick={() => change("activeComment", null)}
        >
          <X size={14} />
          Hide on-screen comment
        </button>
      )}
      <div className="chat-preview">
        <div className="eyebrow">
          <Eye size={12} /> PRIVATE COMMENT PREVIEW
        </div>
        {selected ? (
          <>
            <div
              className={`chat-card ${selected.kind === "paid" ? "paid" : ""}`}
            >
              <strong>
                {selected.sample ? "SAMPLE · " : ""}
                {selected.author}
                <span>{selected.amount}</span>
              </strong>
              <p>{selected.text}</p>
              <small>{selected.platform}</small>
            </div>
            <button
              className="primary"
              onClick={() => change("activeComment", selected)}
            >
              <Radio size={14} />
              Show on stream
            </button>
          </>
        ) : (
          <p>Select a comment below to preview it here.</p>
        )}
        <button className="text-button" onClick={previewSample}>
          Preview a clearly labeled sample
        </button>
      </div>
      <div className="button-pair">
        <button
          className={filter === "all" ? "secondary selected" : "secondary"}
          onClick={() => setFilter("all")}
        >
          All comments
        </button>
        <button
          className={filter === "paid" ? "secondary selected" : "secondary"}
          onClick={() => setFilter("paid")}
        >
          Paid messages
        </button>
      </div>
      <div className="chat-feed">
        {messages
          .filter((m) => filter === "all" || m.kind === "paid")
          .slice()
          .reverse()
          .map((m) => (
            <button
              key={m.id}
              className={`chat-card ${m.kind === "paid" ? "paid" : ""}`}
              onClick={() => setSelected(m)}
            >
              <strong>
                {m.author}
                <span>{m.amount}</span>
              </strong>
              <p>{m.text}</p>
              <small>{m.platform}</small>
            </button>
          ))}
        {!messages.length && (
          <p className="help">
            Real comments will appear here after a connection is established.
          </p>
        )}
      </div>
    </div>
  );
}
