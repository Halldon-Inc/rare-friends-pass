"use client";

import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PassCard, { type PassCardData } from "./PassCard";
import { hasWallet } from "./wallet";

type Pass = PassCardData & { status: string; apple: string; google: string; page: string };
type Me = { address: string; passes: Pass[]; more: number };

export default function MyPasses() {
  const s = useSearchParams().get("s") ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [inWalletIos, setInWalletIos] = useState(false);
  const [href, setHref] = useState("");

  useEffect(() => {
    setHref(window.location.href);
    setInWalletIos(/iPhone|iPad|iPod/.test(navigator.userAgent) && hasWallet());
    QRCode.toDataURL(window.location.href, { margin: 1, width: 296 }).then(setQr, () => setQr(null));
    fetch(`/api/me?s=${encodeURIComponent(s)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setMe(j);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [s]);

  if (error)
    return (
      <div>
        <h1 className="band" style={{ fontFamily: "var(--pixel)", textTransform: "uppercase" }}>Your passes</h1>
        <div className="err">{error}</div>
        <p className="note">
          <a href="/">Sign in again</a>
        </p>
      </div>
    );
  if (!me) return <p className="muted">Reading your Friends from Robinhood Chain…</p>;

  return (
    <div>
      <div className="kicker">
        {me.address.slice(0, 6)}…{me.address.slice(-4)} · {me.passes.length} activated Friend{me.passes.length === 1 ? "" : "s"}
      </div>
      <h1 style={{ fontFamily: "var(--pixel)", fontSize: "clamp(30px,5vw,54px)", textTransform: "uppercase", margin: "0 0 10px", lineHeight: 1 }}>
        Your passes
      </h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        Add each Friend to Apple Wallet or Google Wallet. After that the pass keeps itself up to date, and Claim and Withdraw live on the back
        of the pass. This page link expires in 30 minutes.
      </p>

      {inWalletIos && (
        <div className="okmsg">
          You are in a wallet app&apos;s browser, which may not open Apple Wallet passes.{" "}
          <a href={href.replace(/^https:\/\//, "x-safari-https://")}>Open this page in Safari</a> to add them.
        </div>
      )}

      {qr && (
        <div className="qrbox">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code to open this page on your phone" />
          <div>
            <strong style={{ fontFamily: "var(--pixel)", textTransform: "uppercase" }}>On a computer?</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Scan this with your phone&apos;s camera to open these passes there, then tap Add to Apple Wallet or Add to Google Wallet. No
              second signature needed.
            </p>
          </div>
        </div>
      )}

      <div className="grid">
        {me.passes.map((p) => (
          <div className="tile" key={p.serial}>
            <PassCard p={p} />
            <div className="row">
              <a className="wallet-btn" href={p.apple}>
                Add to Apple Wallet
              </a>
              <a className="wallet-btn g" href={p.google} target="_blank" rel="noreferrer">
                Add to Google Wallet
              </a>
            </div>
            <p className="note">
              {p.title} · {p.status} · <a href={p.page}>Friend page</a>
            </p>
          </div>
        ))}
      </div>
      {me.more > 0 && <p className="note">Showing 24 passes. {me.more} more activated Friends are in this wallet.</p>}
    </div>
  );
}
