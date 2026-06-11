/**
 * EVM chains we accept USDT top-ups on.
 *
 * USDT is an ERC-20 on every chain here, so the receiving wallet
 * (`USDT_DEPOSIT_ADDRESS`) is the *same address* on all of them — only the chain
 * id, token contract, and token decimals differ. We normalize every on-chain
 * amount to 6-decimal "micro-USDT" internally (see {@link lib/topups}), so the
 * per-chain `decimals` here is just what we divide by when reading a transfer.
 *
 * `minConfirmations` is how many blocks we wait before trusting a transfer, tuned
 * loosely to each chain's reorg risk and block time.
 */
export interface Chain {
  /** EVM chain id (also the `chainid` param for the Etherscan V2 API). */
  id: number;
  /** Display name shown to the member. */
  name: string;
  /** Short label for the network the deposit address lives on. */
  network: string;
  /** USDT token contract on this chain (lowercased). */
  usdtContract: string;
  /** USDT's ERC-20 decimals on this chain. */
  decimals: number;
  /** Confirmations required before a transfer is settled. */
  minConfirmations: number;
  /** Block-explorer transaction URL prefix (append a tx hash). */
  explorerTxBase: string;
  /** Default public JSON-RPC endpoint (override per chain with EVM_RPC_<id>). */
  rpcUrl: string;
  /** How many blocks back the very first scan reaches (≈1–2 days per chain). */
  initialLookbackBlocks: number;
}

/** Internal accounting precision: USDT is tracked as 6-decimal micro-units. */
export const USDT_DECIMALS = 6;

/**
 * Supported chains, keyed by id. Addresses are the canonical USDT contracts;
 * note BSC's USDT (BEP-20) uses 18 decimals while the others use 6.
 */
export const CHAINS: Record<number, Chain> = {
  1: {
    id: 1,
    name: "Ethereum",
    network: "ERC20 (Ethereum)",
    usdtContract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    minConfirmations: 12,
    explorerTxBase: "https://etherscan.io/tx/",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    initialLookbackBlocks: 20_000, // ~2.5 days
  },
  56: {
    id: 56,
    name: "BNB Smart Chain",
    network: "BEP20 (BSC)",
    usdtContract: "0x55d398326f99059ff775485246999027b3197955",
    decimals: 18,
    minConfirmations: 15,
    explorerTxBase: "https://bscscan.com/tx/",
    rpcUrl: "https://bsc-rpc.publicnode.com",
    initialLookbackBlocks: 200_000, // ~1.7 days
  },
  137: {
    id: 137,
    name: "Polygon",
    network: "Polygon (PoS)",
    usdtContract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    decimals: 6,
    minConfirmations: 30,
    explorerTxBase: "https://polygonscan.com/tx/",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    initialLookbackBlocks: 80_000, // ~1.8 days
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    network: "Arbitrum One",
    usdtContract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    decimals: 6,
    minConfirmations: 5,
    explorerTxBase: "https://arbiscan.io/tx/",
    rpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    initialLookbackBlocks: 200_000, // L2 blocks are fast (~hours)
  },
  10: {
    id: 10,
    name: "Optimism",
    network: "OP Mainnet",
    usdtContract: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    decimals: 6,
    minConfirmations: 5,
    explorerTxBase: "https://optimistic.etherscan.io/tx/",
    rpcUrl: "https://optimism-rpc.publicnode.com",
    initialLookbackBlocks: 80_000, // ~1.8 days
  },
};

export const ALL_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChain(chainId: number): Chain | undefined {
  return CHAINS[chainId];
}
