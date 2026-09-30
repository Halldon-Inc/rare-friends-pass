# Rare Friends Pass

**Your Friend, in your wallet.** An Apple Wallet and Google Wallet pass for every activated Rare Friend (Genesis and Generations on Robinhood Chain). The front shows the Friend's own on-chain portrait with live claimable rewards, pending rewards and backpack balances. Claim and Withdraw live on the back of the pass.

Live: https://rare-friends-pass.vercel.app

## How it works

1. **Sign once.** Connect the wallet that holds your Friends and sign one free ERC-4361 message naming every activated Friend. No transaction, nothing approved.
2. **Add to Wallet.** One pass per Friend. Claimable RF and WETH, pending RF, and backpack RF, WETH and ETH update themselves (APNs push for Apple, object PATCH for Google) when the chain moves.
3. **Tap Claim.** Rewards move into the Friend's own wallet (its backpack) with no signature. **Tap Withdraw** to move the backpack to the owner's wallet with one wallet confirm per asset.

### Why claim is free and withdraw is not

Checked on chain on 2026-09-30:

- `ActivationManager.claimBatch(asset, collections, ids)` is **permissionless** (simulated from an unrelated address) and can only pay each Friend's own ERC-6551 wallet. So the pass's Claim link has a relayer send it. If the relayer has no gas, the page hands the holder the exact same call to send from any wallet.
- The Friend wallet (implementation `0xed038886c002b285eb0f74971e967b02f6af8ea5`) is a minimal ERC-6551 account: `execute` is owner-only, with no `setPermissions`, no ERC-4337 `validateUserOp` and no signature-based execute. No signature given in advance can authorize a later withdrawal, so Withdraw opens a page with the exact `execute` call ready and the owner confirms it. Funds go to the owner only.

## ERC-8426

Rare Friends predates [ERC-8426 (Wallet Pass Extension)](https://github.com/ethereum/ERCs/pull/2036), so this site acts as the resolver. Every token has a manifest URI in the standard's gated configuration:

```
GET /wallet-pass/eip155/4663/<Genesis|Generations contract>/<tokenId>
GET /wallet-pass/eip155/4663/<contract>/<tokenId>/challenge?address=<owner>
```

Without proof it answers `401 proof_required`. With an ERC-4361 challenge signed by the current owner (`X-Wallet-Pass-Proof`, base64url message + `X-Wallet-Pass-Signature`) it returns `{ formats: { apple, google }, updatedAt }`. Pass links are HMAC capabilities bound to (Friend, current owner), checked against a fresh `ownerOf` read on every use, so a sale kills every link the previous owner held.

The standard now has an open-source SDK (MIT, npm `@erc8426/*`): [huntclubhero/erc8426-sdk](https://github.com/huntclubhero/erc8426-sdk). This site predates it and runs its own resolver on the same protocol. A future Rare Friends contract or registry that adds `passURI` can be checked with `npx @erc8426/conformance`, and wallets or marketplaces can offer Add to Wallet for any Friend with `@erc8426/client`.

## Stack

Next.js 15 on Vercel, viem, passkit-generator (Apple), Google Wallet REST API (generic class), Vercel Blob (device registrations), Vercel Cron (every 10 minutes, pushes only when a number moved about 2% or a balance changed).

Data: Robinhood Chain reads (`ownerOf`, `positions`, `earned`, `tokenBoundAccount`, balances, `tokenURI`) plus rarefriends.com's public `/api/protocol/snapshot` (reward streams, for Pending) and `/api/protocol/owned-nfts`.

## Run it

```
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Env: `PASS_CERT_P12_BASE64`, `PASS_CERT_PASSWORD`, `PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_WWDR_PEM_BASE64`, `GOOGLE_ISSUER_ID`, `GOOGLE_SA_KEY_BASE64`, `PASS_SECRET` (32+ chars), `CRON_SECRET`, `RELAYER_PRIVATE_KEY` (gas only), `BLOB_READ_WRITE_TOKEN`, `PUBLIC_BASE_URL`.

Community build for the Rare Friends Vibeathon, not an official Rare Friends product. By Halldon.
