const { EventEmitter } = require("node:events");
const WebSocket = require("ws");
const clean = (x, n = 1500) => String(x ?? "").slice(0, n);
function youtubeMessage(item) {
  const s = item.snippet || {},
    a = item.authorDetails || {};
  if (s.type === "tombstone" || s.type === "messageDeletedEvent")
    return {
      type: "delete",
      id: "youtube:" + (s.messageDeletedDetails?.deletedMessageId || item.id),
    };
  if (s.type === "userBannedEvent")
    return {
      type: "ban",
      platform: "YouTube",
      authorId: s.userBannedDetails?.bannedUserDetails?.channelId,
    };
  const paid = s.superChatDetails || s.superStickerDetails;
  if (
    ![
      "textMessageEvent",
      "superChatEvent",
      "superStickerEvent",
      "memberMilestoneChatEvent",
      "newSponsorEvent",
      "giftEvent",
    ].includes(s.type)
  )
    return null;
  return {
    type: "message",
    id: "youtube:" + item.id,
    platform: "YouTube",
    authorId: clean(a.channelId),
    author: clean(a.displayName || "Viewer", 80),
    text: clean(
      paid?.userComment ||
        paid?.superStickerMetadata?.altText ||
        s.displayMessage ||
        s.textMessageDetails?.messageText,
    ),
    kind: paid ? "paid" : s.type === "giftEvent" ? "gift" : "comment",
    amount: clean(paid?.amountDisplayString || s.giftDetails?.giftName, 60),
    timestamp: s.publishedAt,
  };
}
function parseIRC(line) {
  const match = line.match(
    /^(?:@([^ ]+) )?(?::([^ ]+) )?([^ ]+)(?: ([^:]*))?(?::(.*))?$/,
  );
  if (!match) return null;
  const tags = Object.fromEntries(
    (match[1] || "")
      .split(";")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [
          p.slice(0, i),
          p
            .slice(i + 1)
            .replace(
              /\\([snr:])/g,
              (_, c) => ({ s: " ", n: "\n", r: "\r", ":": ";" })[c],
            )
            .replace(/\\\\/g, "\\"),
        ];
      }),
  );
  return {
    tags,
    prefix: match[2] || "",
    command: match[3],
    params: (match[4] || "").trim(),
    text: match[5] || "",
  };
}
function twitchMessage(m) {
  if (m.command === "CLEARMSG")
    return { type: "delete", id: "twitch:" + m.tags["target-msg-id"] };
  if (m.command === "CLEARCHAT")
    return m.tags["target-user-id"]
      ? { type: "ban", platform: "Twitch", authorId: m.tags["target-user-id"] }
      : { type: "clear", platform: "Twitch" };
  if (!["PRIVMSG", "USERNOTICE"].includes(m.command)) return null;
  return {
    type: "message",
    id: "twitch:" + (m.tags.id || require("node:crypto").randomUUID()),
    platform: "Twitch",
    authorId: clean(m.tags["user-id"]),
    author: clean(
      m.tags["display-name"] || m.prefix.split("!")[0] || "Viewer",
      80,
    ),
    text: clean(m.text || m.tags["system-msg"]),
    kind: m.tags.bits ? "paid" : "comment",
    amount: m.tags.bits ? `${m.tags.bits} Bits` : "",
    timestamp: new Date(
      Number(m.tags["tmi-sent-ts"]) || Date.now(),
    ).toISOString(),
  };
}
function bridgeMessage(m) {
  if (
    m.type === "reaction" &&
    ["❤️", "👏", "🔥", "😂", "👍", "🎉"].includes(m.emoji)
  )
    return { type: "reaction", emoji: m.emoji };
  if (m.type === "delete" && m.id)
    return { type: "delete", id: "bridge:" + clean(m.id, 200) };
  if (m.type !== "message" || !m.id || typeof m.text !== "string") return null;
  return {
    type: "message",
    id: "bridge:" + clean(m.id, 200),
    platform: clean(m.platform || "Connected platform", 40),
    author: clean(m.author || "Viewer", 80),
    authorId: clean(m.authorId, 100),
    text: clean(m.text),
    kind: m.kind === "paid" ? "paid" : "comment",
    amount: clean(m.amount, 60),
    timestamp: new Date().toISOString(),
  };
}
class ChatHub extends EventEmitter {
  constructor(fetcher = fetch) {
    super();
    this.fetcher = fetcher;
    this.connections = new Map();
  }
  status(provider, state, message) {
    this.emit("event", { type: "status", provider, state, message });
  }
  disconnect(provider) {
    const c = this.connections.get(provider);
    if (c) {
      c.stopped = true;
      clearTimeout(c.timer);
      c.controller?.abort();
      c.ws?.close();
      this.connections.delete(provider);
    }
    this.status(provider, "disconnected", "Disconnected");
  }
  emitMessage(c, m) {
    if (!m) return;
    if (m.type === "message") {
      if (c.seen.has(m.id)) return;
      c.seen.add(m.id);
      if (c.seen.size > 2000) c.seen.delete(c.seen.values().next().value);
    }
    this.emit("event", m);
  }
  async connect(input) {
    const provider = input.provider;
    if (!["youtube", "twitch", "bridge"].includes(provider))
      throw Error("Choose a supported chat connection.");
    this.disconnect(provider);
    const c = {
      stopped: false,
      seen: new Set(),
      controller: new AbortController(),
      failures: 0,
    };
    this.connections.set(provider, c);
    this.status(provider, "connecting", "Connecting…");
    try {
      if (provider === "youtube") {
        if (!/^[\w-]{10,200}$/.test(input.apiKey || ""))
          throw Error("Enter a YouTube Data API key.");
        let id = clean(input.videoId, 500).trim();
        try {
          const u = new URL(id);
          if (
            [
              "youtube.com",
              "www.youtube.com",
              "m.youtube.com",
              "youtu.be",
            ].includes(u.hostname)
          )
            id =
              u.searchParams.get("v") ||
              u.pathname.split("/").filter(Boolean).at(-1);
        } catch {}
        if (!/^[\w-]{11}$/.test(id))
          throw Error("Enter the YouTube video URL or 11-character video ID.");
        const get = async (resource, params) => {
          const u = new URL(
            `https://www.googleapis.com/youtube/v3/${resource}`,
          );
          for (const [k, v] of Object.entries({ ...params, key: input.apiKey }))
            if (v) u.searchParams.set(k, v);
          const r = await this.fetcher(u, {
            signal: AbortSignal.any([
              c.controller.signal,
              AbortSignal.timeout(15000),
            ]),
          });
          const data = await r.json();
          if (!r.ok) {
            const reason = data.error?.errors?.[0]?.reason;
            const allowed = [
              "quotaExceeded",
              "keyInvalid",
              "liveChatEnded",
              "liveChatDisabled",
              "forbidden",
              "liveChatNotFound",
              "rateLimitExceeded",
              "accessNotConfigured",
            ];
            throw Error(
              `YouTube: ${allowed.includes(reason) ? reason : "request failed"}. Check your API key, API access and live event.`,
            );
          }
          return data;
        };
        const video = await get("videos", { part: "liveStreamingDetails", id });
        if (c.stopped) return;
        const liveChatId =
          video.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
        if (!liveChatId)
          throw Error(
            "This video has no active live chat. Start the YouTube broadcast and enable chat.",
          );
        const poll = async () => {
          if (c.stopped) return;
          try {
            const data = await get("liveChat/messages", {
              part: "id,snippet,authorDetails",
              liveChatId,
              pageToken: c.page,
              maxResults: "200",
            });
            if (c.stopped) return;
            c.failures = 0;
            c.page = data.nextPageToken;
            for (const item of data.items || [])
              this.emitMessage(c, youtubeMessage(item));
            if (
              data.offlineAt ||
              (data.items || []).some(
                (i) => i.snippet?.type === "chatEndedEvent",
              )
            ) {
              this.disconnect(provider);
              return;
            }
            this.status(provider, "connected", "YouTube chat connected");
            c.timer = setTimeout(
              poll,
              Math.max(5000, Number(data.pollingIntervalMillis) || 5000),
            );
          } catch (e) {
            if (c.stopped) return;
            c.failures++;
            this.status(
              provider,
              "error",
              e.message || "YouTube connection failed",
            );
            if (c.failures < 4)
              c.timer = setTimeout(poll, Math.min(60000, 10000 * c.failures));
            else this.disconnect(provider);
          }
        };
        await poll();
      } else if (provider === "twitch") {
        const channel = clean(input.channel).toLowerCase().replace(/^#/, "");
        const username = clean(input.username).toLowerCase();
        const token = clean(input.token).replace(/^oauth:/, "");
        if (
          !/^[a-z0-9_]{1,25}$/.test(channel) ||
          !/^[a-z0-9_]{1,25}$/.test(username) ||
          !/^[a-zA-Z0-9]{10,200}$/.test(token)
        )
          throw Error(
            "Enter a Twitch channel, account username and OAuth token with chat:read permission.",
          );
        c.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443", {
          maxPayload: 65536,
          handshakeTimeout: 15000,
        });
        c.ws.on("open", () => {
          c.ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
          c.ws.send("PASS oauth:" + token);
          c.ws.send("NICK " + username);
          c.ws.send("JOIN #" + channel);
        });
        let buffer = "";
        c.ws.on("message", (data) => {
          buffer += data.toString();
          if (buffer.length > 131072) {
            c.ws.close();
            return;
          }
          let i;
          while ((i = buffer.indexOf("\r\n")) >= 0) {
            const line = buffer.slice(0, i);
            buffer = buffer.slice(i + 2);
            const m = parseIRC(line);
            if (!m) continue;
            if (m.command === "PING") c.ws.send("PONG :" + m.text);
            else if (m.command === "ROOMSTATE")
              this.status(provider, "connected", "Twitch chat connected");
            else if (m.command === "NOTICE")
              this.status(
                provider,
                "error",
                "Twitch rejected the connection or channel access. Check your token and channel.",
              );
            else this.emitMessage(c, twitchMessage(m));
          }
        });
      } else {
        const u = new URL(input.url);
        if (!(
          (u.protocol === "wss:" ||
            (u.protocol === "ws:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) &&
          !u.username &&
          !u.password
        ))
          throw Error("Use a secure wss:// chat relay, or ws:// on localhost.");
        if (/[\r\n]/.test(input.token || ""))
          throw Error("Invalid relay token.");
        c.ws = new WebSocket(u, {
          maxPayload: 65536,
          handshakeTimeout: 15000,
          headers: input.token
            ? { Authorization: `Bearer ${input.token}` }
            : {},
        });
        c.ws.on("open", () =>
          this.status(provider, "connected", "Chat relay connected"),
        );
        c.ws.on("message", (data) => {
          try {
            this.emitMessage(c, bridgeMessage(JSON.parse(data.toString())));
          } catch {
            /* Ignore malformed relay events. */
          }
        });
      }
      if (c.ws) {
        c.ws.on("error", () =>
          this.status(
            provider,
            "error",
            "Chat connection failed. Check the connection settings.",
          ),
        );
        c.ws.on("close", () => {
          if (!c.stopped)
            this.status(
              provider,
              "disconnected",
              "Connection closed. Reconnect when ready.",
            );
        });
      }
    } catch (e) {
      this.disconnect(provider);
      this.status(provider, "error", e.message);
      throw e;
    }
  }
  close() {
    for (const provider of this.connections.keys()) this.disconnect(provider);
  }
}
module.exports = {
  ChatHub,
  youtubeMessage,
  parseIRC,
  twitchMessage,
  bridgeMessage,
};
