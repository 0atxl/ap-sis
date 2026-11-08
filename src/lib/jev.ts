export type TokenKind =
  | "spam_airdrop"
  | "dead_or_test_token"
  | "stablecoin"
  | "major_asset"
  | "unknown";

export interface ZombieCandidateInput {
  address: string;
  mint: string;
  name?: string;
  symbol?: string;
  uri?: string;
  decimals: number;
  supply?: string;
  recentSignaturesCount?: number;
  isKnownStablecoin: boolean;
  isTestMintFromCache: boolean;
  programId: string;
  rentLamports: number;
}

export interface ZombieClassification {
  address: string;
  mint: string;
  tokenKind: TokenKind;
  /** Jev confidence (0..1), or null in Heuristic mode (never fake AI confidence). */
  kindConfidence: number | null;
  /** Jev choice probability distribution, or null in Heuristic mode. */
  kindProbabilities: Record<TokenKind, number> | null;
  /** Jev noul probability (0..1) that owner will receive token again soon, or null in Heuristic mode. */
  willReceiveAgain: number | null;
  /** Deterministic policy decision: true iff kind in {spam_airdrop, dead_or_test_token} and willReceiveAgain < 0.3 */
  shouldClose: boolean;
  reason: string;
  source: "jev" | "heuristic";
}

export interface JevApiResponse {
  mode: "jev" | "heuristic";
  model: string;
  latencyMs: number;
  fallbackReason?: string;
  classifications?: ZombieClassification[];
}

/** Pinned Jev model ID verified against client.models.list() / systemOne */
export const PINNED_JEV_MODEL = "jev-1.14.0";

/** Known Mainnet + Devnet stablecoin mints to protect by default */
export const KNOWN_STABLECOIN_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Mainnet USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // Mainnet USDT
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet Circle USDC
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // Devnet USDC-Dev
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
]);

/** Known major ecosystem asset mints */
export const KNOWN_MAJOR_MINTS = new Set<string>([
  "So11111111111111111111111111111111111111112", // Wrapped SOL
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
]);

/**
  * Deterministic policy gate over Jev's structured outputs:
  * Close only if `token_kind` is in `{spam_airdrop, dead_or_test_token}` AND `will_receive_again < 0.3`.
  */
export function evaluateClosePolicy(
  tokenKind: TokenKind,
  willReceiveAgain: number
): { shouldClose: boolean; reason: string } {
  const isClosableKind =
    tokenKind === "spam_airdrop" || tokenKind === "dead_or_test_token";
  if (!isClosableKind) {
    return {
      shouldClose: false,
      reason: `Kept (${tokenKind.replace(/_/g, " ")}) — opt in manually to close`,
    };
  }
  if (willReceiveAgain >= 0.3) {
    return {
      shouldClose: false,
      reason: `Kept — repeat-receipt probability ${(willReceiveAgain * 100).toFixed(0)}% >= 30% threshold`,
    };
  }
  return {
    shouldClose: true,
    reason: `Safe to close (${tokenKind.replace(/_/g, " ")}, repeat prob ${(willReceiveAgain * 100).toFixed(0)}% < 30%)`,
  };
}

/**
  * Honest rules-based Heuristic fallback (used when offline, missing API key, or timeout).
  * Never emits synthetic confidence numbers pretending to be Jev.
  */
export function classifyZombiesHeuristic(
  candidates: ZombieCandidateInput[]
): ZombieClassification[] {
  return candidates.map((c) => {
    if (c.isKnownStablecoin || KNOWN_STABLECOIN_MINTS.has(c.mint)) {
      return {
        address: c.address,
        mint: c.mint,
        tokenKind: "stablecoin",
        kindConfidence: null,
        kindProbabilities: null,
        willReceiveAgain: null,
        shouldClose: false,
        reason: "Heuristic rule: known stablecoin mint (kept by default)",
        source: "heuristic",
      };
    }

    if (KNOWN_MAJOR_MINTS.has(c.mint)) {
      return {
        address: c.address,
        mint: c.mint,
        tokenKind: "major_asset",
        kindConfidence: null,
        kindProbabilities: null,
        willReceiveAgain: null,
        shouldClose: false,
        reason: "Heuristic rule: known major asset mint (kept by default)",
        source: "heuristic",
      };
    }

    if (c.isTestMintFromCache) {
      return {
        address: c.address,
        mint: c.mint,
        tokenKind: "dead_or_test_token",
        kindConfidence: null,
        kindProbabilities: null,
        willReceiveAgain: null,
        shouldClose: true,
        reason: "Heuristic rule: matches local ap-sis Devnet test mint cache",
        source: "heuristic",
      };
    }

    if (c.supply === "0") {
      return {
        address: c.address,
        mint: c.mint,
        tokenKind: "dead_or_test_token",
        kindConfidence: null,
        kindProbabilities: null,
        willReceiveAgain: null,
        shouldClose: true,
        reason: "Heuristic rule: empty account on zero-supply mint",
        source: "heuristic",
      };
    }

    return {
      address: c.address,
      mint: c.mint,
      tokenKind: "unknown",
      kindConfidence: null,
      kindProbabilities: null,
      willReceiveAgain: null,
      shouldClose: false,
      reason: "Heuristic rule: unverified mint (kept unless you check the box)",
      source: "heuristic",
    };
  });
}

/**
  * Client-side helper to invoke `/api/ai/jev`.
  * Falls back to local Heuristic mode if fetch fails on the client.
  */
export async function requestJevEvaluation(payload: {
  candidates?: ZombieCandidateInput[];
}): Promise<JevApiResponse> {
  const start = performance.now();
  try {
    const res = await fetch("/api/ai/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as JevApiResponse;
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      mode: "heuristic",
      model: "heuristic-rules-v2",
      latencyMs,
      fallbackReason:
        err instanceof Error ? err.message : "Client network fallback",
      classifications: payload.candidates
        ? classifyZombiesHeuristic(payload.candidates)
        : undefined,
    };
  }
}
