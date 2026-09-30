import http2 from "node:http2";
import forge from "node-forge";
import { PKPass } from "passkit-generator";
import { bannerPng, portraitPng } from "./art";
import { baseUrl, fmtUsd, type PassView } from "./view";

// Apple Wallet: a signed .pkpass per Friend, the Apple web service's pass refresh, and certificate-based APNs pushes.
// Same Pass Type ID certificate and code path as WALLETCHI (github.com/Halldon-Inc/punchcard, server/src/passes).

type Certs = { signerCert: string; signerKey: string; wwdr: string };
let certs: Certs | null = null;

export function appleConfigured() {
  return !!(process.env.PASS_CERT_P12_BASE64 && process.env.PASS_CERT_PASSWORD && process.env.APPLE_WWDR_PEM_BASE64 && process.env.PASS_TYPE_ID && process.env.APPLE_TEAM_ID);
}
export const passTypeId = () => process.env.PASS_TYPE_ID ?? "";

function loadCerts(): Certs {
  if (certs) return certs;
  if (!appleConfigured()) throw new Error("Apple pass certificate is not configured");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(process.env.PASS_CERT_P12_BASE64!)), process.env.PASS_CERT_PASSWORD!);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!certBag || !keyBag) throw new Error("PASS_CERT_P12 holds no certificate or key");
  certs = {
    signerCert: forge.pki.certificateToPem(certBag),
    signerKey: forge.pki.privateKeyToPem(keyBag),
    wwdr: Buffer.from(process.env.APPLE_WWDR_PEM_BASE64!, "base64").toString("utf8"),
  };
  return certs;
}

const link = (href: string, text: string) => `<a href="${href.replace(/&/g, "&amp;")}">${text}</a>`;

function passJson(v: PassView, authToken: string) {
  const base = baseUrl();
  const usd = (n: number) => (v.pricesKnown && n > 0 ? ` (${fmtUsd(n)})` : "");
  const publicPage = `${base}/f/${v.serial}`;
  const backFields = [
    {
      key: "claim",
      label: "CLAIM",
      value: "Claim rewards into this Friend's backpack",
      attributedValue: link(v.links.claim, "Claim rewards into this Friend's backpack"),
    },
    {
      key: "withdraw",
      label: "WITHDRAW",
      value: "Withdraw the backpack to your wallet",
      attributedValue: link(v.links.withdraw, "Withdraw the backpack to your wallet"),
    },
    { key: "claimable", label: "Claimable now", value: `${v.claim.rfText} RF + ${v.claim.wethText} WETH${usd(v.claim.usd)}` },
    { key: "pending", label: "Pending (this week's stream)", value: `${v.pending.rfText} RF + ${v.pending.wethText} WETH${usd(v.pending.usd)}` },
    { key: "bag", label: "Backpack", value: `${v.bag.rfText} RF · ${v.bag.wethText} WETH · ${v.bag.ethText} ETH${usd(v.bag.usd)}` },
    { key: "status", label: "Status", value: v.status },
    ...(v.wallet ? [{ key: "wallet", label: "Friend's own wallet (ERC-6551)", value: v.wallet }] : []),
    { key: "owner", label: "Owner", value: v.owner },
    { key: "block", label: "Read at Robinhood Chain block", value: v.block },
    {
      key: "how",
      label: "How this pass works",
      value:
        "Claim needs no signature: rewards can only ever land in this Friend's own wallet, so the pass sends the claim for you. Withdraw moves the backpack to the owner's wallet and asks your wallet to confirm once, because only the owner can move a Friend's wallet. The pass updates itself when the numbers move. If the Friend is sold, this pass stops working.",
    },
    { key: "open", label: "Friend page", value: publicPage, attributedValue: link(publicPage, "Open this Friend's page") },
    { key: "rf", label: "Rare Friends", value: v.links.rarefriends, attributedValue: link(v.links.rarefriends, "rarefriends.com portfolio") },
  ];
  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId(),
    teamIdentifier: process.env.APPLE_TEAM_ID,
    serialNumber: v.serial,
    organizationName: "Rare Friends Pass",
    description: `${v.title}: live rewards and backpack`,
    logoText: "RARE FRIENDS",
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: "rgb(0,0,0)",
    labelColor: "rgb(160,160,160)",
    ...(base.startsWith("https://") ? { webServiceURL: `${base}/apple`, authenticationToken: authToken } : {}),
    sharingProhibited: true,
    barcodes: [{ format: "PKBarcodeFormatQR", message: publicPage, messageEncoding: "iso-8859-1", altText: v.title }],
    storeCard: {
      headerFields: [{ key: "title", label: v.ref.collection === "Genesis" ? "GENESIS" : "GENERATIONS", value: `#${v.ref.id}` }],
      primaryFields: [{ key: "claimRf", label: "CLAIMABLE RF", value: v.claim.rfText, changeMessage: "Claimable now: %@ RF" }],
      secondaryFields: [
        { key: "claimWeth", label: "CLAIMABLE WETH", value: v.claim.wethText, changeMessage: "Claimable now: %@ WETH" },
        { key: "pendingRf", label: "PENDING RF", value: v.pending.rfText, textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: [
        { key: "bagRf", label: "BACKPACK RF", value: v.bag.rfText, changeMessage: "Backpack: %@ RF" },
        { key: "bagWeth", label: "BACKPACK WETH", value: v.bag.wethText, textAlignment: "PKTextAlignmentRight", changeMessage: "Backpack: %@ WETH" },
      ],
      backFields,
    },
  };
}

export async function buildPkpass(v: PassView, authToken: string): Promise<Buffer> {
  const c = loadCerts();
  const [s1, s2, s3, i1, i2, i3, l1, l2, l3] = await Promise.all([
    bannerPng(v.ref, 375, 144),
    bannerPng(v.ref, 750, 288),
    bannerPng(v.ref, 1125, 432),
    portraitPng(v.ref, 29),
    portraitPng(v.ref, 58),
    portraitPng(v.ref, 87),
    portraitPng(v.ref, 50),
    portraitPng(v.ref, 100),
    portraitPng(v.ref, 150),
  ]);
  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson(v, authToken))),
      "strip.png": s1,
      "strip@2x.png": s2,
      "strip@3x.png": s3,
      "icon.png": i1,
      "icon@2x.png": i2,
      "icon@3x.png": i3,
      "logo.png": l1,
      "logo@2x.png": l2,
      "logo@3x.png": l3,
    },
    { wwdr: c.wwdr, signerCert: c.signerCert, signerKey: c.signerKey }
  );
  return pass.getAsBuffer();
}

/** Background push: an empty payload makes the device fetch the fresh pass; changeMessage drives the lock-screen line. */
export async function pushApple(tokens: string[]): Promise<{ ok: number; failed: { token: string; reason: string }[] }> {
  if (!tokens.length || !appleConfigured()) return { ok: 0, failed: [] };
  const c = loadCerts();
  const session = http2.connect("https://api.push.apple.com:443", { cert: c.signerCert, key: c.signerKey });
  session.on("error", () => {});
  const failed: { token: string; reason: string }[] = [];
  let ok = 0;
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = session.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": passTypeId(),
              "apns-push-type": "background",
              "apns-priority": "5",
              "content-type": "application/json",
            });
            let status = 0;
            let body = "";
            const timer = setTimeout(() => {
              failed.push({ token, reason: "timeout" });
              req.close();
              resolve();
            }, 8_000);
            req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
            req.setEncoding("utf8");
            req.on("data", (d) => (body += d));
            req.on("end", () => {
              clearTimeout(timer);
              if (status === 200) ok += 1;
              else failed.push({ token, reason: `${status} ${body}`.trim() });
              resolve();
            });
            req.on("error", (e) => {
              clearTimeout(timer);
              failed.push({ token, reason: e.message });
              resolve();
            });
            req.end("{}");
          })
      )
    );
  } finally {
    session.close();
  }
  return { ok, failed };
}
