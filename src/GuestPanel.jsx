import React, { useRef, useState, useEffect } from "react";
import { Peer } from "peerjs";
import { Copy, Users, Video, PhoneOff } from "lucide-react";
export function GuestPanel({
  hidden,
  media,
  change,
  config,
  onError,
  onRoomState,
}) {
  const [link, setLink] = useState(""),
    [status, setStatus] = useState("Room closed"),
    [pending, setPending] = useState(null),
    [guest, setGuest] = useState(null),
    [copied, setCopied] = useState(false);
  const room = useRef(null),
    connection = useRef(null),
    pendingRef = useRef(null),
    outgoing = useRef(null),
    token = useRef(null);
  const endCall = () => {
    connection.current?.close();
    connection.current = null;
    pendingRef.current?.close();
    pendingRef.current = null;
    setPending(null);
    setGuest(null);
    media.current?.removeGuest();
  };
  const close = () => {
    endCall();
    room.current?.destroy();
    room.current = null;
    outgoing.current?.getVideoTracks().forEach((t) => t.stop());
    outgoing.current = null;
    setLink("");
    setStatus("Room closed");
    onRoomState(false);
  };
  useEffect(
    () => () => {
      connection.current?.close();
      pendingRef.current?.close();
      room.current?.destroy();
      outgoing.current?.getVideoTracks().forEach((t) => t.stop());
    },
    [],
  );
  const open = async () => {
    try {
      close();
      if (!media.current.camera || !media.current.mic)
        throw Error(
          "Add your camera and microphone before opening the interview room.",
        );
      setStatus("Opening interview room…");
      outgoing.current = await media.current.createCallStream();
      token.current = crypto.randomUUID() + crypto.randomUUID();
      const peer = new Peer();
      room.current = peer;
      peer.on("open", (id) => {
        setLink(
          `https://xunaidlnt-sudo.github.io/X-treem/guest.html#peer=${encodeURIComponent(id)}&token=${encodeURIComponent(token.current)}`,
        );
        setStatus("Room open · waiting for a guest");
        onRoomState(true);
      });
      peer.on("error", () => {
        setStatus(
          "Interview connection failed. Check your network and reopen the room.",
        );
      });
      peer.on("disconnected", () =>
        setStatus(
          "Signaling disconnected. Reopen the room if the invitation stops working.",
        ),
      );
      peer.on("call", (call) => {
        if (
          call.metadata?.token !== token.current ||
          connection.current ||
          pendingRef.current
        ) {
          call.close();
          return;
        }
        pendingRef.current = call;
        setPending(String(call.metadata?.name || "Guest").slice(0, 60));
        call.on("close", () => {
          if (connection.current === call) {
            connection.current = null;
            setGuest(null);
            media.current.removeGuest();
            setStatus("Guest left · room still open");
          }
          if (pendingRef.current === call) {
            pendingRef.current = null;
            setPending(null);
          }
        });
        call.on("error", () => {
          setStatus(
            "Guest connection failed. They may need a different network.",
          );
          endCall();
        });
      });
    } catch (e) {
      setStatus("Room closed");
      onError(e.message);
    }
  };
  const accept = () => {
    const call = pendingRef.current;
    if (!call) return;
    const name = pending;
    connection.current = call;
    pendingRef.current = null;
    setPending(null);
    call.on("stream", async (stream) => {
      try {
        await media.current.addGuest(stream, name);
        setGuest(name);
        setStatus("Guest connected");
        change("scene", "interview");
      } catch (e) {
        onError(e.message);
        endCall();
      }
    });
    call.answer(outgoing.current);
    setStatus("Connecting guest…");
  };
  return (
    <div hidden={hidden}>
      <div className="inspector-heading">
        <div className="eyebrow">A GOOD CONVERSATION STARTS HERE</div>
        <h2>Guest interview</h2>
        <p>One host + one browser guest. Stream, record, or both.</p>
      </div>
      <p className="connection-state">{status}</p>
      {!link ? (
        <button className="primary" onClick={open}>
          <Users size={16} />
          Open interview room
        </button>
      ) : (
        <>
          <label>
            Private invitation link
            <textarea readOnly rows={3} value={link} />
          </label>
          <div className="button-pair">
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  onError("Select and copy the invitation link manually.");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy invitation"}
            </button>
            <button className="secondary" onClick={close}>
              <PhoneOff size={14} />
              Close room
            </button>
          </div>
        </>
      )}
      {pending && (
        <div className="guest-card">
          <strong>{pending} wants to join</strong>
          <p>
            Accepting includes their audio in your mix. Choose the Interview
            scene to show their video.
          </p>
          <div className="button-pair">
            <button className="primary" onClick={accept}>
              Accept guest
            </button>
            <button
              className="secondary"
              onClick={() => {
                pendingRef.current?.close();
                pendingRef.current = null;
                setPending(null);
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}
      {guest && (
        <div className="guest-card">
          <strong>
            <span className="dot live" /> {guest}
          </strong>
          <label className="toggle-row">
            Mute guest audio
            <input
              type="checkbox"
              checked={!!config.guestMuted}
              onChange={(e) => change("guestMuted", e.target.checked)}
            />
          </label>
          <label>
            Guest volume
            <input
              type="range"
              min={0}
              max={150}
              value={config.guestVolume ?? 100}
              onChange={(e) => change("guestVolume", +e.target.value)}
            />
          </label>
          <button
            className="secondary"
            onClick={() => change("scene", "interview")}
          >
            <Video size={15} />
            Show interview scene
          </button>
          <button className="text-button" onClick={endCall}>
            Remove guest
          </button>
        </div>
      )}
      <div className="tip">
        <p>
          Use headphones to prevent echo. Guests are told the session may be
          streamed or recorded before joining. Enable local recording in
          Destinations to save the combined interview in both formats.
        </p>
      </div>
      <p className="help">
        Invitations use PeerJS cloud signaling, Google STUN and PeerJS public
        TURN servers when needed. Media uses encrypted WebRTC and may pass
        through a relay. Service availability and restrictive networks can
        affect calls. Keep this app open throughout the interview.
      </p>
    </div>
  );
}
