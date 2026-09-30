import Link from "next/link";

export function Nav() {
  return (
    <div className="wrap">
      <nav className="nav">
        <Link href="/" className="brand">
          <i aria-hidden />
          RARE FRIENDS PASS
        </Link>
        <div className="links">
          <a href="/#how" className="hide-sm">How it works</a>
          <a href="/#erc" className="hide-xs">ERC-8426</a>
          <a href="https://rarefriends.com" target="_blank" rel="noreferrer">rarefriends.com</a>
        </div>
      </nav>
    </div>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <p>
          Rare Friends Pass is a community build for the Rare Friends Vibeathon, not an official Rare Friends product. It reads Robinhood Chain
          (4663) and rarefriends.com&apos;s public protocol routes. Claim sends <code>ActivationManager.claimBatch</code>, which can only pay a
          Friend&apos;s own wallet. Withdraw is the Friend wallet&apos;s owner-only <code>execute</code>, signed by you. Nothing here holds your keys.
        </p>
        <p>
          Built on <a href="https://github.com/ethereum/ERCs/pull/2036">ERC-8426</a> (Wallet Pass Extension), the standard behind{" "}
          <a href="https://www.playwalletchi.com">WALLETCHI</a>. By Halldon.
        </p>
      </div>
    </footer>
  );
}
