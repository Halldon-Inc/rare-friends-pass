import { notFound } from "next/navigation";
import QRCode from "qrcode";
import Actions from "@/components/Actions";
import { Footer, Nav } from "@/components/Chrome";
import PassCard from "@/components/PassCard";
import { parseSerial } from "@/lib/chain";
import { passTokenValid } from "@/lib/secure";
import { baseUrl, fmtUsd, loadView } from "@/lib/view";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ serial: string }>; searchParams: Promise<{ t?: string; do?: string }> };

export async function generateMetadata({ params }: P) {
  const { serial } = await params;
  return { title: `${serial} · Rare Friends Pass`, robots: { index: false } };
}

export default async function FriendPage({ params, searchParams }: P) {
  const { serial } = await params;
  const sp = await searchParams;
  const ref = parseSerial(serial);
  if (!ref) notFound();
  let v;
  try {
    v = await loadView(ref);
  } catch {
    return (
      <main>
        <Nav />
        <div className="wrap" style={{ padding: "60px 0" }}>
          <div className="err">Robinhood Chain did not answer, or this Friend does not exist. Refresh in a moment.</div>
        </div>
      </main>
    );
  }
  const holder = passTokenValid(v.serial, v.owner, sp.t);
  const focus = sp.do === "claim" || sp.do === "withdraw" ? sp.do : null;
  const qr = await QRCode.toDataURL(`${baseUrl()}/f/${v.serial}`, { margin: 0, width: 184 });
  const usd = (n: number) => (v.pricesKnown && n > 0 ? ` · ${fmtUsd(n)}` : "");

  return (
    <main>
      <Nav />
      <div className="wrap">
        <div className="friend">
          <div>
            <PassCard p={v} qr={qr} />
            <p className="passcap">
              {v.title} · {v.status} · block {v.block}
            </p>
          </div>
          <div>
            <div className="kicker">{holder ? "Holder view: opened from your pass" : "Public view"}</div>
            <h1 style={{ fontFamily: "var(--pixel)", fontSize: "clamp(30px,4.6vw,52px)", textTransform: "uppercase", margin: "0 0 8px", lineHeight: 1 }}>
              {v.title}
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>
              Owner {v.owner.slice(0, 6)}…{v.owner.slice(-4)}
              {v.wallet ? ` · backpack ${v.wallet.slice(0, 6)}…${v.wallet.slice(-4)}` : ""}
            </p>

            {!v.activated && (
              <div className="okmsg">This Friend is not activated, so it earns nothing and gets no pass. Activate it on rarefriends.com first.</div>
            )}

            <div className="panel">
              <h2>Live numbers</h2>
              <div className="stat">
                <div>
                  <small>Claimable</small>
                  <strong>
                    {v.claim.rfText} RF
                    <br />
                    {v.claim.wethText} WETH
                  </strong>
                  <small>{usd(v.claim.usd).replace(" · ", "")}</small>
                </div>
                <div>
                  <small>Pending</small>
                  <strong>
                    {v.pending.rfText} RF
                    <br />
                    {v.pending.wethText} WETH
                  </strong>
                  <small>this week&apos;s stream</small>
                </div>
                <div>
                  <small>Backpack</small>
                  <strong>
                    {v.bag.rfText} RF
                    <br />
                    {v.bag.wethText} WETH · {v.bag.ethText} ETH
                  </strong>
                </div>
              </div>
              <p className="note">
                Claimable is <code>earned()</code> on the ActivationManager. Pending is rarefriends.com&apos;s own formula: this Friend&apos;s share
                of what is left in the week&apos;s reward streams. Backpack is the Friend&apos;s ERC-6551 wallet.
              </p>
            </div>

            {holder ? (
              <Actions
                serial={v.serial}
                t={sp.t!}
                focus={focus}
                owner={v.owner}
                wallet={v.wallet}
                claim={{ rfText: v.claim.rfText, wethText: v.claim.wethText, any: v.claim.rf > 0 || v.claim.weth > 0 }}
                bag={{ rfText: v.bag.rfText, wethText: v.bag.wethText, ethText: v.bag.ethText, wei: v.bag.wei }}
              />
            ) : (
              <div className="panel">
                <h2>Is this your Friend?</h2>
                <p className="muted">
                  Holders get Claim and Withdraw on the back of their pass. Sign once to get yours.
                </p>
                <a className="btn" href="/">
                  Get my passes
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
