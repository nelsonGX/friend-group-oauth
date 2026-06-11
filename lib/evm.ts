import { getChain, USDT_DECIMALS, type Chain } from "@/lib/chains";

/**
 * Minimal EVM JSON-RPC client for watching USDT deposits.
 *
 * We scan each chain's public RPC for ERC-20 `Transfer` events of the chain's
 * USDT contract whose recipient is one of our deposit addresses, via
 * `eth_getLogs`. This is free and works on every EVM chain — unlike the Etherscan
 * V2 free tier, which only covers Ethereum mainnet.
 *
 * Endpoints default to public nodes and can be overridden per chain with an
 * `EVM_RPC_<chainId>` environment variable (e.g. `EVM_RPC_56`). Network-only:
 * the crediting logic lives in {@link lib/topups} so it stays testable.
 */

/** keccak256("Transfer(address,address,uint256)"). */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_CHUNK = 8000;
const MIN_CHUNK = 200;

export interface IncomingTransfer {
  txHash: string;
  /** Sender address, lowercased. */
  from: string;
  /** Recipient (one of our deposit addresses), lowercased. */
  toAddress: string;
  /** Amount received, normalized to 6-decimal micro-USDT. */
  valueMicros: number;
  blockNumber: number;
}

function rpcEndpoint(chain: Chain): string {
  return process.env[`EVM_RPC_${chain.id}`] || chain.rpcUrl;
}

async function rpcCall(chain: Chain, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcEndpoint(chain), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result;
}

/** Scale a raw on-chain token amount (integer base units) to 6-decimal micros. */
export function toMicros(rawValue: string, tokenDecimals: number): number {
  let v: bigint;
  try {
    v = BigInt(rawValue);
  } catch {
    return 0;
  }
  const ten = BigInt(10);
  if (tokenDecimals >= USDT_DECIMALS) {
    return Number(v / ten ** BigInt(tokenDecimals - USDT_DECIMALS));
  }
  return Number(v * ten ** BigInt(USDT_DECIMALS - tokenDecimals));
}

/** Current chain head (block number), or 0 on error. */
export async function getTip(chainId: number): Promise<number> {
  const chain = getChain(chainId);
  if (!chain) return 0;
  try {
    return parseInt((await rpcCall(chain, "eth_blockNumber", [])) as string, 16) || 0;
  } catch {
    return 0;
  }
}

/** Left-pad an address to a 32-byte topic. */
function addressTopic(addr: string): string {
  return `0x${addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/**
 * USDT transfers into any of `addresses` between `fromBlock` and `toBlock`
 * (inclusive), normalized to micros. Splits the range adaptively: if a node
 * rejects a window (range/result caps vary by provider), it retries with a
 * smaller span, growing back on success. Throws only if even MIN_CHUNK fails.
 */
export async function getTransfersTo(
  chainId: number,
  addresses: string[],
  fromBlock: number,
  toBlock: number,
): Promise<IncomingTransfer[]> {
  const chain = getChain(chainId);
  if (!chain || addresses.length === 0 || toBlock < fromBlock) return [];

  const topicTo = addresses.map(addressTopic);
  const known = new Set(addresses.map((a) => a.toLowerCase()));
  const out: IncomingTransfer[] = [];

  let start = fromBlock;
  let span = DEFAULT_CHUNK;
  while (start <= toBlock) {
    const end = Math.min(start + span - 1, toBlock);
    let logs: RpcLog[];
    try {
      logs = (await rpcCall(chain, "eth_getLogs", [
        {
          address: chain.usdtContract,
          topics: [TRANSFER_TOPIC, null, topicTo],
          fromBlock: `0x${start.toString(16)}`,
          toBlock: `0x${end.toString(16)}`,
        },
      ])) as RpcLog[];
    } catch (err) {
      if (span > MIN_CHUNK) {
        span = Math.max(MIN_CHUNK, Math.floor(span / 2));
        continue;
      }
      throw err;
    }

    for (const log of logs) {
      const to = `0x${log.topics[2]?.slice(26).toLowerCase()}`;
      if (!known.has(to)) continue;
      const raw = log.data && log.data !== "0x" ? log.data : "0x0";
      out.push({
        txHash: (log.transactionHash ?? "").toLowerCase(),
        from: `0x${log.topics[1]?.slice(26).toLowerCase()}`,
        toAddress: to,
        valueMicros: toMicros(raw, chain.decimals),
        blockNumber: parseInt(log.blockNumber, 16) || 0,
      });
    }

    start = end + 1;
    if (span < DEFAULT_CHUNK) span = Math.min(DEFAULT_CHUNK, span * 2);
  }
  return out;
}

interface RpcLog {
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
}
