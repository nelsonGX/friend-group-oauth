import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { env } from "@/lib/env";

/**
 * Watch-only derivation of per-member USDT deposit addresses.
 *
 * The server is configured with an *extended public key* (`USDT_HD_XPUB`) — the
 * BIP44 Ethereum account node `m/44'/60'/0'` of a wallet whose seed stays
 * offline. From the public key alone we derive non-hardened children
 * `0/index`, i.e. the standard receive path `m/44'/60'/0'/0/index` (so member
 * `index` maps to that wallet's address #index). No private key ever touches the
 * server, so it can receive but never spend; deposits are swept manually.
 *
 * EVM addresses are deterministic from the key, so one derived address receives
 * USDT on every supported chain.
 */

let cachedAccount: HDKey | null = null;
let cachedXpub: string | null = null;

function accountNode(): HDKey {
  const xpub = env.USDT_HD_XPUB;
  if (cachedAccount && cachedXpub === xpub) return cachedAccount;
  const node = HDKey.fromExtendedKey(xpub);
  if (!node.publicKey) {
    throw new Error("USDT_HD_XPUB is not a valid extended public key.");
  }
  cachedAccount = node;
  cachedXpub = xpub;
  return node;
}

/** Derive the lowercased EVM deposit address for a member's `index`. */
export function deriveDepositAddress(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error("Derivation index out of range.");
  }
  // Non-hardened receive path relative to the account node: 0/index.
  const child = accountNode().deriveChild(0).deriveChild(index);
  if (!child.publicKey) throw new Error("Failed to derive public key.");
  // Uncompress the secp256k1 point, drop the 0x04 prefix, keccak256, last 20 bytes.
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

/**
 * Apply the EIP-55 mixed-case checksum to a lowercased `0x` address, for display.
 * The check is over the address hex (no `0x`), hashed with keccak256.
 */
export function toChecksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}
