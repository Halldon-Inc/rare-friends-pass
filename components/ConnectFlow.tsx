"use client";

import { useEffect, useState } from "react";
import { connect, hasWallet, sign, walletAppLinks } from "./wallet";

type Phase = "idle" | "reading" | "signing" | "done";

export default function ConnectFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<number | null>(null);
  const [injected, setInjected] = useState(true);
  const [here, setHere] = useState("");

  useEffect(() => {
    setInjected(hasWallet());
    setHere(window.location.href);
  }, []);

  async function start() {
    setError(null);
    try {
      const address = await connect();
      setPhase("reading");
      const c = await fetch("/api/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.error === "no activated Friends in this wallet" ? "This wallet holds no activated Friends. Activate one on rarefriends.com, then come back." : cj.error);
      setFound(cj.friends.length);
      setPhase("signing");
      const signature = await sign(address, cj.message);
      const s = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: cj.message, signature }) });
      const sj = await s.json();
      if (!s.ok) throw new Error(sj.error);
      setPhase("done");
      window.location.href = `/me?s=${encodeURIComponent(sj.session)}`;
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
      setError(/rejected|denied/i.test(m) ? "Signature cancelled. Nothing was signed." : m);
      setPhase("idle");
    }
  }

  if (!injected) {
    return (
      <div>
        <div className="row">
          {here &&
            walletAppLinks(here).map((l) => (
              <a key={l.name} className="btn" href={l.href}>
                Open in {l.name}
              </a>
            ))}
        </div>
        <p className="note">
          No wallet in this browser. Open this page in your wallet app, or sign on a computer and scan the QR code it shows with your phone.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="row">
        <button className="btn" onClick={start} disabled={phase !== "idle"}>
          {phase === "idle" && "Get my passes"}
          {phase === "reading" && "Finding your Friends…"}
          {phase === "signing" && `Sign once for ${found} pass${found === 1 ? "" : "es"}`}
          {phase === "done" && "Opening your passes…"}
        </button>
      </div>
      <p className="note">One free signature. No transaction, no approval, nothing moves.</p>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
