"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { connect, EXPLORER, hasWallet, send, waitFor, walletAppLinks, withdrawCall } from "./wallet";

type Props = {
  serial: string;
  t: string;
  focus: "claim" | "withdraw" | null;
  owner: Address;
  wallet: Address | null;
  claim: { rfText: string; wethText: string; any: boolean };
  bag: { rfText: string; wethText: string; ethText: string; wei: { rf: string; weth: string; eth: string } };
};

type ClaimCall = { asset: string; to: Address; data: Hex };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const errText = (e: unknown) => {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
  return /rejected|denied/i.test(m) ? "Cancelled in the wallet. Nothing was sent." : m.split("\n")[0];
};

export default function Actions(p: Props) {
  const router = useRouter();
  const claimRef = useRef<HTMLDivElement>(null);
  const withdrawRef = useRef<HTMLDivElement>(null);
  const [href, setHref] = useState("");
  const [injected, setInjected] = useState(false);

  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const [fallback, setFallback] = useState<ClaimCall[] | null>(null);
  const [txs, setTxs] = useState<{ label: string; hash: string }[]>([]);

  const [wBusy, setWBusy] = useState<string | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);

  useEffect(() => {
    setHref(window.location.href);
    setInjected(hasWallet());
    const el = p.focus === "claim" ? claimRef.current : p.focus === "withdraw" ? withdrawRef.current : null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [p.focus]);

  async function refreshPass() {
    await fetch("/api/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serial: p.serial, t: p.t }) }).catch(() => null);
    router.refresh();
  }

  async function claim() {
    setClaimBusy(true);
    setClaimErr(null);
    setClaimMsg(null);
    try {
      const r = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serial: p.serial, t: p.t }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.status === "sent") {
        setTxs(j.txs.map((x: { asset: string; hash: string }) => ({ label: `Claimed ${x.asset}`, hash: x.hash })));
        setClaimMsg("Claimed into the backpack. Your pass updates in a moment.");
        router.refresh();
      } else if (j.status === "nothing") {
        setClaimMsg("Nothing to claim right now. Rewards stream in every block, so check back soon.");
      } else {
        setFallback(j.calls);
      }
    } catch (e) {
      setClaimErr(errText(e));
    } finally {
      setClaimBusy(false);
    }
  }

  async function claimFromWallet() {
    if (!fallback) return;
    setClaimBusy(true);
    setClaimErr(null);
    try {
      const me = await connect();
      for (const c of fallback) {
        const hash = await send(me, { to: c.to, data: c.data });
        setTxs((t) => [...t, { label: `Claimed ${c.asset}`, hash }]);
        await waitFor(hash);
      }
      setFallback(null);
      setClaimMsg("Claimed into the backpack. Your pass updates in a moment.");
      await refreshPass();
    } catch (e) {
      setClaimErr(errText(e));
    } finally {
      setClaimBusy(false);
    }
  }

  async function withdraw(asset: "RF" | "WETH" | "ETH") {
    setWErr(null);
    if (!p.wallet) return;
    setWBusy(asset);
    try {
      const me = await connect();
      if (me.toLowerCase() !== p.owner.toLowerCase()) throw new Error(`Connect the wallet that owns this Friend (${short(p.owner)}). This one is ${short(me)}.`);
      const amount = BigInt(asset === "RF" ? p.bag.wei.rf : asset === "WETH" ? p.bag.wei.weth : p.bag.wei.eth);
      const hash = await send(me, withdrawCall(p.wallet, p.owner, asset, amount));
      setTxs((t) => [...t, { label: `Withdrew ${asset}`, hash }]);
      await waitFor(hash);
      await refreshPass();
    } catch (e) {
      setWErr(errText(e));
    } finally {
      setWBusy(null);
    }
  }

  const assets = [
    { k: "RF" as const, text: p.bag.rfText, wei: p.bag.wei.rf },
    { k: "WETH" as const, text: p.bag.wethText, wei: p.bag.wei.weth },
    { k: "ETH" as const, text: p.bag.ethText, wei: p.bag.wei.eth },
  ].filter((a) => a.wei !== "0");

  const openIn = href ? walletAppLinks(href) : [];

  return (
    <>
      <div className={`panel ${p.focus === "claim" ? "hot" : ""}`} ref={claimRef}>
        <h2>Claim</h2>
        <p className="muted">Moves earned rewards into this Friend&apos;s backpack. No signature: the pass sends it for you.</p>
        <div className="stat">
          <div>
            <small>Claimable RF</small>
            <strong>{p.claim.rfText}</strong>
          </div>
          <div>
            <small>Claimable WETH</small>
            <strong>{p.claim.wethText}</strong>
          </div>
          <div>
            <small>Goes to</small>
            <strong>{p.wallet ? short(p.wallet) : "backpack"}</strong>
          </div>
        </div>
        {!fallback && (
          <button className="btn wide" onClick={claim} disabled={claimBusy || !p.claim.any}>
            {claimBusy ? "Claiming…" : p.claim.any ? "Claim now" : "Nothing to claim yet"}
          </button>
        )}
        {fallback && (
          <div>
            <div className="okmsg">
              The free claim relayer has no gas right now. Send the same claim from any wallet instead: you pay the network fee (cents), and
              the rewards still land only in this Friend&apos;s backpack.
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              {injected ? (
                <button className="btn wide" onClick={claimFromWallet} disabled={claimBusy}>
                  {claimBusy ? "Waiting for the wallet…" : `Claim from my wallet (${fallback.length} confirm${fallback.length === 1 ? "" : "s"})`}
                </button>
              ) : (
                openIn.map((l) => (
                  <a key={l.name} className="btn" href={l.href}>
                    Open in {l.name}
                  </a>
                ))
              )}
            </div>
          </div>
        )}
        {claimMsg && <div className="okmsg">{claimMsg}</div>}
        {claimErr && <div className="err">{claimErr}</div>}
      </div>

      <div className={`panel ${p.focus === "withdraw" ? "hot" : ""}`} ref={withdrawRef}>
        <h2>Withdraw</h2>
        <p className="muted">
          Moves the backpack to the owner&apos;s wallet ({short(p.owner)}). Only the owner can move a Friend&apos;s wallet, so your wallet confirms
          each asset once.
        </p>
        <div className="stat">
          <div>
            <small>Backpack RF</small>
            <strong>{p.bag.rfText}</strong>
          </div>
          <div>
            <small>Backpack WETH</small>
            <strong>{p.bag.wethText}</strong>
          </div>
          <div>
            <small>Backpack ETH</small>
            <strong>{p.bag.ethText}</strong>
          </div>
        </div>
        {!assets.length && <p className="note">The backpack is empty. Claim first, then withdraw.</p>}
        {!!assets.length &&
          (injected ? (
            <div className="row">
              {assets.map((a) => (
                <button key={a.k} className="btn" onClick={() => withdraw(a.k)} disabled={!!wBusy}>
                  {wBusy === a.k ? "Confirm in wallet…" : `Withdraw ${a.text} ${a.k}`}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div className="row">
                {openIn.map((l) => (
                  <a key={l.name} className="btn" href={l.href}>
                    Open in {l.name}
                  </a>
                ))}
              </div>
              <p className="note">Withdraw needs the owner&apos;s wallet to confirm. This opens the same page inside your wallet app.</p>
            </div>
          ))}
        {wErr && <div className="err">{wErr}</div>}
      </div>

      {!!txs.length && (
        <div className="panel txs">
          <h2>Transactions</h2>
          {txs.map((x) => (
            <a key={x.hash} href={`${EXPLORER}/tx/${x.hash}`} target="_blank" rel="noreferrer">
              {x.label}: {x.hash}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
