# Connecting chat from additional platforms

Streaming and chat are independent connections. Any service that supplies RTMP/RTMPS ingest can receive video from X-treem. Its chat requires that service's supported API or an authorized compatible relay.

Built-in readers: YouTube Data API v3 live comments, Super Chats and Super Sticker text; Twitch authenticated IRC comments and Bits. X-treem does not post messages, spend money, moderate accounts, scrape private chats or bypass platform access rules.

For Facebook, Instagram, TikTok, Kick, LinkedIn and other platforms, connect a relay you operate or trust under **Comments → Other platforms → Chat relay**. The relay must translate its authorized upstream chat into the JSON WebSocket events below. Such a platform-specific relay is not bundled in this release. Simply entering a platform website URL will not connect its chat.

Remote relays must use `wss://`. `ws://` is allowed only on localhost for local adapters. If a token is entered, X-treem sends `Authorization: Bearer <token>` to the configured relay. Saved credentials use the same Windows-backed encryption as stream keys.

Send one JSON object per WebSocket frame, at most 64 KB:

```json
{
  "type": "message",
  "id": "unique-message-id",
  "platform": "Platform name",
  "authorId": "user-id",
  "author": "Alex",
  "text": "Great interview!",
  "kind": "comment"
}
```

Paid messages can include their original displayed amount:

```json
{
  "type": "message",
  "id": "donation-id",
  "platform": "Platform name",
  "author": "Sam",
  "text": "Keep creating!",
  "kind": "paid",
  "amount": "AED 20.00"
}
```

Only identify actual paid events as paid. The application does not process payments and a displayed paid card does not independently verify a transaction. The relay is responsible for authenticating its upstream source.

```json
{"type":"delete","id":"unique-message-id"}
{"type":"reaction","emoji":"🎉"}
```

Supported reactions: ❤️ 👏 🔥 😂 👍 🎉. Reaction events animate only when the host enables incoming reactions. The host can also trigger overlays manually. These overlays are not an aggregate count of platform reactions. Super Sticker artwork is not supplied by YouTube's chat API; X-treem displays its description and amount.

Messages are kept in memory, with a 300-message UI limit and bounded deduplication. They are not written to chat logs. A message shown on stream becomes part of the outgoing video and recordings. Previewing a message does not put it on air; the host must press **Show on stream**. Platform deletion/ban events remove matching cards where the upstream API supplies those events.

YouTube polling respects the service's refresh interval with a minimum of five seconds. The list endpoint costs API quota; long broadcasts may need an increased quota allocation. No API credentials are shipped with the app. Refer to [YouTube live chat API](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list) and [Twitch IRC authentication](https://dev.twitch.tv/docs/chat/irc).
