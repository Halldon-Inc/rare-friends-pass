import QRCode from "qrcode";
import { Footer, Nav } from "@/components/Chrome";
import ConnectFlow from "@/components/ConnectFlow";
import PassCard from "@/components/PassCard";
import Peek from "@/components/Peek";
import { CONTRACTS } from "@/lib/chain";
import { baseUrl, loadView, type PassView } from "@/lib/view";

export const revalidate = 60;

const DEMO = { collection: "Genesis" as const, id: 292n };

export default async function Home() {
  let demo: PassView | null = null;
  try {
    demo = await loadView(DEMO);
  } catch {
    demo = null;
  }
  const qr = demo ? await QRCode.toDataURL(`${baseUrl()}/f/${demo.serial}`, { margin: 0, width: 184 }) : undefined;
  const manifest = `${baseUrl()}/wallet-pass/eip155/4663/${CONTRACTS.Genesis}/292`;

  return (
    <main>
      <Nav />
      <div className="wrap">
        <section className="hero">
          <div>
            <div className="kicker">Genesis + Generations · Apple Wallet + Google Wallet</div>
            <h1>
              Your Friend, <span>in your wallet.</span>
            </h1>
            <p className="lede">
              Every activated Rare Friend gets a wallet pass with its own art on the front, plus live claimable rewards, pending rewards and
              backpack balances. Claim and withdraw from the pass. You only visit this site once.
            </p>
            <ConnectFlow />
            <Peek />
          </div>
          <div>
            {demo ? (
              <>
                <PassCard p={demo} qr={qr} />
                <p className="passcap">
                  Live: {demo.title}, read from Robinhood Chain block {demo.block}. This is the real pass layout. Tap the QR (or preview any
                  Friend) to see its page.
                </p>
              </>
            ) : (
              <p className="muted">Robinhood Chain did not answer just now. Refresh to see a live pass.</p>
            )}
          </div>
        </section>
      </div>

      <section className="band" id="how">
        <div className="wrap">
          <h2>Sign once. Then live in Wallet.</h2>
          <p className="sub">
            No app to install and no dashboard to check. After one signature, everything else happens from the pass on your phone.
          </p>
          <div className="steps">
            <div className="step">
              <b>1</b>
              <h3>Sign once</h3>
              <p>
                Connect the wallet that holds your Friends and sign one free message (ERC-4361). It proves you own them and names every
                activated Friend. No transaction, nothing approved.
              </p>
            </div>
            <div className="step">
              <b>2</b>
              <h3>Add to Wallet</h3>
              <p>
                One pass per Friend, with its on-chain portrait on the front. Claimable RF and WETH, pending RF, and backpack RF, WETH and ETH
                update themselves by push as the chain moves.
              </p>
            </div>
            <div className="step">
              <b>3</b>
              <h3>Tap to claim</h3>
              <p>
                Flip the pass and tap Claim: rewards move into the Friend&apos;s backpack with no signature. Tap Withdraw to move the backpack to
                your wallet with one confirm.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>Why claim is free and withdraw asks once</h2>
          <p className="sub">We checked the contracts on chain before building, and the pass does exactly what they allow.</p>
          <div className="split">
            <div className="card">
              <h3>Claim: zero signatures</h3>
              <p>
                <code>ActivationManager.claimBatch</code> is permissionless, and it can only ever pay the Friend&apos;s own ERC-6551 wallet (its
                backpack). So the pass&apos;s Claim link has a relayer send it for you. If the relayer is out of gas, the page hands the same call
                to any wallet you like: anyone can send it, and the rewards still land only in the backpack.
              </p>
            </div>
            <div className="card">
              <h3>Withdraw: one confirm</h3>
              <p>
                A Friend&apos;s backpack is a minimal ERC-6551 account: only the NFT&apos;s owner can call <code>execute</code>, and it has no
                delegation or session-key hook. So no signature given in advance can move it later. Withdraw opens a page with the exact
                transfer ready, and your wallet confirms it. Funds go to the owner and nowhere else.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="erc">
        <div className="wrap">
          <h2>ERC-8426 on a collection that predates it</h2>
          <p className="sub">
            ERC-8426 (Wallet Pass Extension) lets an NFT resolve to its own Apple and Google Wallet pass. Rare Friends shipped before the
            standard, so this site acts as the resolver: every Genesis and Generations token has a manifest URI in the standard&apos;s gated
            configuration.
          </p>
          <div className="split">
            <div className="card">
              <h3>The manifest</h3>
              <pre className="code">GET {manifest}</pre>
              <p>
                Without proof it answers <code>401 proof_required</code> and never leaks a pass link. With an ERC-4361 challenge signed by the
                current owner (<code>X-Wallet-Pass-Proof</code> + <code>X-Wallet-Pass-Signature</code>) it returns{" "}
                <code>{`{ formats: { apple, google }, updatedAt }`}</code>. The pass links are bound to the current owner, so a sale kills them
                all at once.
              </p>
            </div>
            <div className="card">
              <h3>For the Rare Friends team</h3>
              <ul>
                <li>
                  Adding <code>passURI(tokenId)</code> to a future Friend contract (or a registry) pointing here makes any wallet app able to
                  find the pass. Nothing else changes.
                </li>
                <li>
                  A permissions hook on the Friend wallet (in the style of Tokenbound V3&apos;s <code>setPermissions</code>) would let an owner
                  grant a withdraw-to-owner-only executor, which makes Withdraw one tap too.
                </li>
                <li>
                  The pass keeps rewards in front of holders every day. Rewards that get seen get claimed, and claimed RF gets used.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
