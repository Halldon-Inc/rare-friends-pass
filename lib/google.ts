import { importPKCS8, SignJWT } from "jose";
import { baseUrl, fmtUsd, type PassView } from "./view";

// Google Wallet: one generic class for the collection, one object per Friend. Same issuer account and service account
// as WALLETCHI. The object is upserted through the REST API and the save link only REFERENCES it, so the link stays
// short and a later PATCH (after a claim, or when rewards move) updates the card already in the wallet.

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLASS_SUFFIX = "rare_friends_pass_v1";

type Sa = { client_email: string; private_key: string };
let sa: Sa | null = null;
let token: { value: string; exp: number } | null = null;
let classReady = false;

export function googleConfigured() {
  return !!(process.env.GOOGLE_ISSUER_ID && process.env.GOOGLE_SA_KEY_BASE64);
}
function account(): Sa {
  if (!sa) sa = JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_BASE64!, "base64").toString("utf8")) as Sa;
  return sa;
}
const issuer = () => process.env.GOOGLE_ISSUER_ID!;
const classId = () => `${issuer()}.${CLASS_SUFFIX}`;
export const objectId = (serial: string) => `${issuer()}.rfpass_${serial.replace(/[^A-Za-z0-9]/g, "_")}`;

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const a = account();
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(a.client_email)
    .setSubject(a.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(a.private_key, "RS256"));
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(8_000),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) throw new Error(`google token exchange failed: ${res.status}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function call(path: string, init: RequestInit = {}) {
  const t = await accessToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${t}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
}

const row = (a: string, b: string) => ({
  twoItems: {
    startItem: { firstValue: { fields: [{ fieldPath: `object.textModulesData['${a}']` }] } },
    endItem: { firstValue: { fields: [{ fieldPath: `object.textModulesData['${b}']` }] } },
  },
});
function genericClass() {
  return {
    id: classId(),
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    classTemplateInfo: { cardTemplateOverride: { cardRowTemplateInfos: [row("claim_rf", "claim_weth"), row("bag_rf", "bag_weth")] } },
  };
}

async function ensureClass() {
  if (classReady) return;
  const get = await call(`/genericClass/${classId()}`);
  if (get.status === 404) {
    const res = await call(`/genericClass`, { method: "POST", body: JSON.stringify(genericClass()) });
    if (!res.ok) throw new Error(`create class failed: ${res.status} ${await res.text()}`);
  } else if (get.ok) {
    await call(`/genericClass/${classId()}`, { method: "PUT", body: JSON.stringify(genericClass()) });
  } else {
    throw new Error(`get class failed: ${get.status} ${await get.text()}`);
  }
  classReady = true;
}

const text = (s: string) => ({ defaultValue: { language: "en-US", value: s } });

function genericObject(v: PassView) {
  const base = baseUrl();
  const usd = (n: number) => (v.pricesKnown && n > 0 ? ` (${fmtUsd(n)})` : "");
  return {
    id: objectId(v.serial),
    classId: classId(),
    state: "ACTIVE",
    hexBackgroundColor: "#000000",
    logo: { sourceUri: { uri: `${base}/api/art/${v.serial}/logo.png` }, contentDescription: text(v.title) },
    cardTitle: text("Rare Friends"),
    subheader: text(v.status),
    header: text(v.title),
    heroImage: { sourceUri: { uri: `${base}/api/art/${v.serial}/hero.png?v=${v.hash}` }, contentDescription: text(`${v.title}, on-chain portrait`) },
    barcode: { type: "QR_CODE", value: `${base}/f/${v.serial}`, alternateText: v.title },
    textModulesData: [
      { id: "claim_rf", header: "Claimable RF", body: v.claim.rfText },
      { id: "claim_weth", header: "Claimable WETH", body: v.claim.wethText },
      { id: "bag_rf", header: "Backpack RF", body: v.bag.rfText },
      { id: "bag_weth", header: "Backpack WETH", body: v.bag.wethText },
      { id: "pending", header: "Pending (this week's stream)", body: `${v.pending.rfText} RF + ${v.pending.wethText} WETH${usd(v.pending.usd)}` },
      { id: "bag_eth", header: "Backpack ETH", body: v.bag.ethText },
      {
        id: "how",
        header: "How this pass works",
        body: "Claim needs no signature: rewards can only land in this Friend's own wallet, so the pass sends the claim for you. Withdraw moves the backpack to the owner's wallet with one confirm. If the Friend is sold, this pass stops working.",
      },
    ],
    linksModuleData: {
      uris: [
        { id: "claim", uri: v.links.claim, description: "Claim rewards into the backpack" },
        { id: "withdraw", uri: v.links.withdraw, description: "Withdraw the backpack to your wallet" },
        { id: "rf", uri: v.links.rarefriends, description: "rarefriends.com portfolio" },
      ],
    },
  };
}

/** Create or refresh the object. PATCH on refresh so a card already in someone's wallet updates in place. */
export async function upsertGoogle(v: PassView) {
  await ensureClass();
  const id = objectId(v.serial);
  const body = JSON.stringify(genericObject(v));
  const patch = await call(`/genericObject/${id}`, { method: "PUT", body });
  if (patch.status === 404) {
    const res = await call(`/genericObject`, { method: "POST", body });
    if (!res.ok) throw new Error(`create object failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (!patch.ok) throw new Error(`update object failed: ${patch.status} ${await patch.text()}`);
}

export async function googleSaveUrl(v: PassView) {
  await upsertGoogle(v);
  const a = account();
  const jwt = await new SignJWT({
    iss: a.client_email,
    aud: "google",
    typ: "savetowallet",
    origins: [baseUrl()],
    payload: { genericObjects: [{ id: objectId(v.serial), classId: classId() }] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(await importPKCS8(a.private_key, "RS256"));
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

/** What Google thinks of the class (used by the health check). */
export async function googleClassStatus() {
  await ensureClass();
  const res = await call(`/genericClass/${classId()}`);
  const j = (await res.json()) as { id?: string; reviewStatus?: string };
  return { id: j.id, reviewStatus: j.reviewStatus ?? "n/a (generic)" };
}
