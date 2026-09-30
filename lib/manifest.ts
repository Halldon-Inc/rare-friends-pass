import { CHAIN_ID, CONTRACTS, type FriendRef } from "./chain";

/** Resolve an ERC-8426 manifest path (eip155/<chainId>/<contract>/<tokenId>) to a Rare Friend. */
export function refFromPath(chain: string, contract: string, id: string): FriendRef | null {
  if (chain !== String(CHAIN_ID) || !/^[1-9][0-9]{0,9}$/.test(id)) return null;
  const c = contract.toLowerCase();
  if (c === CONTRACTS.Genesis.toLowerCase()) return { collection: "Genesis", id: BigInt(id) };
  if (c === CONTRACTS.Generations.toLowerCase()) return { collection: "Generations", id: BigInt(id) };
  return null;
}
