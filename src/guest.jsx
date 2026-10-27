import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Peer } from "peerjs";
import { GuestShare } from "./guest-share";
import "./style.css";
import "./additions.css";
function Guest() {
  const [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [status, setStatus] = useState("Get ready for a great conversation."),
    [joined, setJoined] = useState(false),
    [mic, setMic] = useState(true),
    [camera, setCamera] = useState(true);
  const [connected, setConnected] = useState(false),
    [sharing, setSharing] = useState(false),
    [shareBusy, setShareBusy] = useState(false);
  const selfVideo = useRef(),
    hostVideo = useRef(),
    stream = useRef(),
    peer = useRef(),
    call = useRef();
  const share = useRef();
  if (!share.current)
    share.current = new GuestShare({
      getCall: () => call.current,
      getCamera: () => stream.current,
      display: (options) => {
        if (!navigator.mediaDevices.getDisplayMedia)
          throw Error("Screen sharing requires a supported desktop browser.");
        return navigator.mediaDevices.getDisplayMedia(options);
      },
      preview: (value) => {
        if (selfVideo.current) {
          selfVideo.current.srcObject = value;
          if (value) void selfVideo.current.play().catch(() => {});
        }
      },
      changed: setSharing,
    });
  const params = new URLSearchParams(location.hash.slice(1));
  const valid = params.get("peer") && params.get("token");
  const leave = () => {
    share.current.dispose();
    setSharing(false);
    setConnected(false);
    const c = call.current,
      p = peer.current;
    call.current = null;
    peer.current = null;
    c?.removeAllListeners();
    c?.close();
    p?.removeAllListeners();
    p?.destroy();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setJoined(false);
    setStatus("You have left the interview.");
  };
  useEffect(
    () => () => {
      share.current.dispose();
      call.current?.removeAllListeners();
      call.current?.close();
      peer.current?.removeAllListeners();
      peer.current?.destroy();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const join = async () => {
    try {
      setStatus("Opening your camera and microphone…");
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      selfVideo.current.srcObject = stream.current;
      await selfVideo.current.play();
      setJoined(true);
      setMic(true);
      setCamera(true);
      const p = new Peer();
      peer.current = p;
      p.on("open", () => {
        const c = p.call(params.get("peer"), stream.current, {
          metadata: {
            name: name.trim().slice(0, 60) || "Guest",
            token: params.get("token"),
          },
        });
        call.current = c;
        setStatus("Waiting for your host to accept…");
        c.on("stream", async (remote) => {
          hostVideo.current.srcObject = remote;
          await hostVideo.current.play().catch(() => {});
          setStatus("Connected · your host may be streaming or recording.");
          setConnected(true);
        });
        c.on("close", () => {
          leave();
          setStatus("The host ended this interview connection.");
        });
        c.on("error", () => {
          leave();
          setStatus("Connection failed. Try a different network and rejoin.");
        });
      });
      p.on("error", () => {
        leave();
        setStatus(
          "Could not reach the host. Ask for a fresh invitation or try a different network.",
        );
      });
    } catch {
      leave();
      setStatus(
        "Camera or microphone access failed. Check browser permissions and try again.",
      );
    }
  };
  return (
    <main className="guest-page">
      <div className="wordmark">
        X-treem <span>GUEST STUDIO</span>
      </div>
      <div className="eyebrow">YOU’RE INVITED</div>
      <h1>
        A seat at the conversation<span>.</span>
      </h1>
      <p>{status}</p>
      <div className="guest-videos">
        <div>
          <video ref={selfVideo} autoPlay playsInline muted />
          <span>You</span>
        </div>
        <div>
          <video ref={hostVideo} autoPlay playsInline controls />
          <span>Your host</span>
        </div>
      </div>
      {!joined ? (
        <section>
          <label>
            Your name
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
            />
          </label>
          <label className="guest-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I understand the host may broadcast and record my video and audio.
          </label>
          <button
            className="primary"
            disabled={!valid || !consent || !name.trim()}
            onClick={join}
          >
            Join interview
          </button>
          {!valid && (
            <p className="error-text">
              Open the private invitation link your host shared.
            </p>
          )}
        </section>
      ) : (
        <div className="button-pair">
          <button
            className="secondary"
            onClick={() => {
              stream.current
                .getAudioTracks()
                .forEach((t) => (t.enabled = !mic));
              setMic(!mic);
            }}
          >
            {mic ? "Mute microphone" : "Unmute microphone"}
          </button>
          <button
            className="secondary"
            disabled={sharing || shareBusy}
            onClick={() => {
              stream.current
                .getVideoTracks()
                .forEach((t) => (t.enabled = !camera));
              setCamera(!camera);
            }}
          >
            {camera ? "Turn camera off" : "Turn camera on"}
          </button>
          <button
            className="secondary guest-share-button"
            disabled={!connected || shareBusy}
            onClick={async () => {
              setShareBusy(true);
              try {
                if (sharing) await share.current.stop();
                else await share.current.start();
              } catch (error) {
                setStatus(
                  error.name === "NotAllowedError"
                    ? "Screen sharing was canceled. Your camera stays connected."
                    : error.message,
                );
              } finally {
                setShareBusy(false);
              }
            }}
          >
            {shareBusy
              ? "Changing video…"
              : sharing
                ? "Stop sharing screen"
                : "Share your screen"}
          </button>
          <button className="danger" onClick={leave}>
            Leave interview
          </button>
        </div>
      )}
      {joined && (
        <p className="help">
          Sharing replaces your camera in the host’s preview and active
          broadcast. Choose only the window or screen you want to show. Your
          microphone continues; computer audio is not shared. Stop sharing to
          return to your camera.
        </p>
      )}
      <p className="help">
        Use headphones. This page uses PeerJS signaling and Google STUN to
        connect you to your host; restrictive networks may prevent a connection.
        Share your invitation only with the intended guest.
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Guest />);
