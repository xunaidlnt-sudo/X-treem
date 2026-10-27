const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ChatHub,
  youtubeMessage,
  parseIRC,
  twitchMessage,
  bridgeMessage,
} = require("../electron/chat.cjs");
test("normalizes YouTube paid messages and moderation events", () => {
  const m = youtubeMessage({
    id: "one",
    authorDetails: { displayName: "Alex", channelId: "a" },
    snippet: {
      type: "superChatEvent",
      superChatDetails: {
        amountDisplayString: "AED 20.00",
        userComment: "Great interview",
      },
    },
  });
  assert.equal(m.kind, "paid");
  assert.equal(m.amount, "AED 20.00");
  assert.equal(m.text, "Great interview");
  assert.equal(
    youtubeMessage({ id: "one", snippet: { type: "tombstone" } }).type,
    "delete",
  );
  assert.equal(
    youtubeMessage({
      snippet: {
        type: "userBannedEvent",
        userBannedDetails: { bannedUserDetails: { channelId: "x" } },
      },
    }).authorId,
    "x",
  );
});
test("parses Twitch tagged messages, Bits, Unicode and deletes", () => {
  const parsed = parseIRC(
    "@id=abc;display-name=Alex\\sDoe;user-id=u;bits=100 :alex!alex@tmi.twitch.tv PRIVMSG #room :Hello 🎉",
  );
  const m = twitchMessage(parsed);
  assert.equal(m.author, "Alex Doe");
  assert.equal(m.text, "Hello 🎉");
  assert.equal(m.amount, "100 Bits");
  assert.equal(
    twitchMessage(
      parseIRC("@target-msg-id=abc :tmi.twitch.tv CLEARMSG #room :deleted"),
    ).id,
    "twitch:abc",
  );
  assert.equal(parseIRC("PING :tmi.twitch.tv").text, "tmi.twitch.tv");
});
test("bounds relay messages and validates reaction events", () => {
  assert.equal(
    bridgeMessage({ type: "message", id: "1", text: "x".repeat(3000) }).text
      .length,
    1500,
  );
  assert.equal(bridgeMessage({ type: "reaction", emoji: "🔥" }).emoji, "🔥");
  assert.equal(bridgeMessage({ type: "reaction", emoji: "bad" }), null);
});
test("YouTube polling resolves the video, deduplicates messages and stops cleanly", async () => {
  let calls = 0;
  const hub = new ChatHub(async () => ({
    ok: true,
    json: async () =>
      ++calls === 1
        ? { items: [{ liveStreamingDetails: { activeLiveChatId: "chat" } }] }
        : {
            items: [
              {
                id: "m",
                snippet: { type: "textMessageEvent", displayMessage: "hello" },
                authorDetails: { displayName: "Viewer" },
              },
              {
                id: "m",
                snippet: { type: "textMessageEvent", displayMessage: "hello" },
              },
            ],
            nextPageToken: "next",
            pollingIntervalMillis: 6000,
          },
  }));
  const events = [];
  hub.on("event", (e) => events.push(e));
  await hub.connect({
    provider: "youtube",
    apiKey: "syntheticapikey",
    videoId: "abcdefghijk",
  });
  assert.equal(events.filter((e) => e.type === "message").length, 1);
  assert.equal(calls, 2);
  hub.close();
  assert.equal(hub.connections.size, 0);
});
test("rejects unsafe relay transport and malformed Twitch credentials", async () => {
  const hub = new ChatHub();
  await assert.rejects(
    hub.connect({ provider: "bridge", url: "ws://remote.example/chat" }),
  );
  await assert.rejects(
    hub.connect({ provider: "bridge", url: "file:///private" }),
  );
  await assert.rejects(
    hub.connect({
      provider: "twitch",
      channel: "room\r\nJOIN #bad",
      username: "a",
      token: "syntheticapikey",
    }),
  );
  hub.close();
});
