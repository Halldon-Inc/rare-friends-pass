// HTML twin of the Apple Wallet pass front: same fields, same order, same strip art. Used for the no-wallet demo and
// the pass list, so what you see here is what lands in Wallet.

export type PassCardData = {
  serial: string;
  title: string;
  claim: { rfText: string; wethText: string };
  pending: { rfText: string };
  bag: { rfText: string; wethText: string };
};

export default function PassCard({ p, qr }: { p: PassCardData; qr?: string }) {
  const genesis = p.serial.startsWith("genesis-");
  const id = p.serial.split("-")[1];
  return (
    <div className="pass" aria-label={`Wallet pass for ${p.title}`}>
      <div className="top">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/art/${p.serial}/portrait.png`} alt="" width={26} height={26} />
          RARE FRIENDS
        </div>
        <div className="hdr">
          <div className="lab">{genesis ? "Genesis" : "Generations"}</div>
          <div className="val">#{id}</div>
        </div>
      </div>
      <div className="strip" style={{ backgroundImage: `url(/api/art/${p.serial}/strip.png)` }}>
        <div className="primary">
          <div className="lab">Claimable RF</div>
          <div className="val">{p.claim.rfText}</div>
        </div>
      </div>
      <div className="fields">
        <div>
          <div className="lab">Claimable WETH</div>
          <div className="val">{p.claim.wethText}</div>
        </div>
        <div className="r">
          <div className="lab">Pending RF</div>
          <div className="val">{p.pending.rfText}</div>
        </div>
        <div>
          <div className="lab">Backpack RF</div>
          <div className="val">{p.bag.rfText}</div>
        </div>
        <div className="r">
          <div className="lab">Backpack WETH</div>
          <div className="val">{p.bag.wethText}</div>
        </div>
      </div>
      {qr ? (
        <div className="qr">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR code for ${p.title}`} />
          </div>
        </div>
      ) : (
        <div style={{ height: 14 }} />
      )}
    </div>
  );
}
