/**
 * EVM chains we accept stablecoin top-ups on.
 *
 * We accept both USDT and USDC — both are USD-pegged, so the rate is identical
 * (1 token = 32 credits). Each chain lists the token contracts we watch; the
 * receiving wallet is the *same address* on every chain (EVM addresses are
 * deterministic), so only the chain id and the per-chain token contracts differ.
 * We normalize every on-chain amount to 6-decimal "micros" internally (see
 * {@link lib/topups}); a token's `decimals` is just what we divide by — note
 * BSC's USDT/USDC use 18 decimals while everywhere else uses 6.
 *
 * `minConfirmations` is how many blocks we wait before trusting a transfer, tuned
 * loosely to each chain's reorg risk and block time.
 */
export interface Token {
  /** Display symbol — "USDT" or "USDC". */
  symbol: string;
  /** Token contract on this chain (lowercased). */
  address: string;
  /** The token's ERC-20 decimals on this chain. */
  decimals: number;
}

export interface Chain {
  /** EVM chain id. */
  id: number;
  /** Display name shown to the member. */
  name: string;
  /** Short label for the network the deposit address lives on. */
  network: string;
  /** Stablecoin contracts we credit on this chain (USDT + USDC variants). */
  tokens: Token[];
  /** Confirmations required before a transfer is settled. */
  minConfirmations: number;
  /** Block-explorer transaction URL prefix (append a tx hash). */
  explorerTxBase: string;
  /** Default public JSON-RPC endpoint (override per chain with EVM_RPC_<id>). */
  rpcUrl: string;
  /** How many blocks back the very first scan reaches (≈1–2 days per chain). */
  initialLookbackBlocks: number;
}

/** Internal accounting precision: amounts are tracked as 6-decimal micro-units. */
export const USDT_DECIMALS = 6;

/**
 * Supported chains, keyed by id. Token addresses are the canonical USDT and USDC
 * contracts (including the still-widely-held bridged USDC.e on the L2s/Polygon).
 */
export const CHAINS: Record<number, Chain> = {
  1: {
    id: 1,
    name: "Ethereum",
    network: "ERC20 (Ethereum)",
    tokens: [
      { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
      { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
    ],
    minConfirmations: 12,
    explorerTxBase: "https://etherscan.io/tx/",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    initialLookbackBlocks: 7_000, // ~1 day; public nodes prune older logs
  },
  56: {
    id: 56,
    name: "BNB Smart Chain",
    network: "BEP20 (BSC)",
    tokens: [
      { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
      { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
    ],
    minConfirmations: 15,
    explorerTxBase: "https://bscscan.com/tx/",
    rpcUrl: "https://bsc-rpc.publicnode.com",
    initialLookbackBlocks: 9_000, // ~2h; public BSC nodes prune older logs
  },
  137: {
    id: 137,
    name: "Polygon",
    network: "Polygon (PoS)",
    tokens: [
      { symbol: "USDT", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 },
      { symbol: "USDC", address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },
      { symbol: "USDC", address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6 }, // USDC.e
    ],
    minConfirmations: 30,
    explorerTxBase: "https://polygonscan.com/tx/",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    initialLookbackBlocks: 25_000, // ~14h
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    network: "Arbitrum One",
    tokens: [
      { symbol: "USDT", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6 },
      { symbol: "USDC", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6 },
      { symbol: "USDC", address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", decimals: 6 }, // USDC.e
    ],
    minConfirmations: 5,
    explorerTxBase: "https://arbiscan.io/tx/",
    rpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    initialLookbackBlocks: 100_000, // L2 blocks are fast (~hours)
  },
  10: {
    id: 10,
    name: "Optimism",
    network: "OP Mainnet",
    tokens: [
      { symbol: "USDT", address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6 },
      { symbol: "USDC", address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6 },
      { symbol: "USDC", address: "0x7f5c764cbc14f9669b88837ca1490cca17c31607", decimals: 6 }, // USDC.e
    ],
    minConfirmations: 5,
    explorerTxBase: "https://optimistic.etherscan.io/tx/",
    rpcUrl: "https://optimism-rpc.publicnode.com",
    initialLookbackBlocks: 25_000, // ~14h
  },
};

export const ALL_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChain(chainId: number): Chain | undefined {
  return CHAINS[chainId];
}
