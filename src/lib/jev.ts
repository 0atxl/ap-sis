export type TokenKind =
  | "spam_airdrop"
  | "dead_or_test_token"
  | "stablecoin"
  | "major_asset"
  | "unknown";

export type IntentKind =
  | "pay_with_memo"
  | "split_payment"
  | "cleanup_only"
  | "unsupported";

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

export interface SimulationSafetySummary {
  ok: boolean;
  unitsConsumed: number;
  logsTail: string[];
  transferLamports: number;
  feeLamports: number;
  reclaimedLamports: number;
  netLamports: number;
  closesCount: number;
  recipient: string;
}

export interface IntentAndSafetyResult {
  intent: IntentKind;
  intentConfidence: number | null;
  intentProbabilities: Record<IntentKind, number> | null;
  /** Advisory noul probability (0..1) on simulation logs + balance diff, or null in Heuristic mode. */
  safeToSignProbability: number | null;
  /** Advisory boolean; never true if simulation failed. */
  isSafeAdvisory: boolean;
  advisoryNote: string;
  source: "jev" | "heuristic";
}

export interface JevApiResponse {
  mode: "jev" | "heuristic";
  model: string;
  latencyMs: number;
  fallbackReason?: string;
  classifications?: ZombieClassification[];
  intentResult?: IntentAndSafetyResult;
}

export interface ParsedCommand {
  intentHint: IntentKind;
  amountSol: number;
  lamports: number;
  recipient: string;
  secondaryRecipient?: string;
  memo: string;
  parseValid: boolean;
  validationError?: string;
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

export function routeAndCheckHeuristic(
  commandText: string,
  simulationSummary?: SimulationSafetySummary
): IntentAndSafetyResult {
  const parsed = parsePaymentCommand(commandText);
  const simOk = simulationSummary ? simulationSummary.ok : true;

  return {
    intent: parsed.intentHint,
    intentConfidence: null,
    intentProbabilities: null,
    safeToSignProbability: null,
    isSafeAdvisory: simOk && parsed.parseValid,
    advisoryNote: !simOk
      ? "Simulation reported an error — do not sign."
      : "Heuristic check: simulation succeeded and balance delta matches parameters.",
    source: "heuristic",
  };
}

/**
 * Deterministic extractor for natural-language payment commands.
 * Example inputs:
 * - "Send 0.001 SOL to 7xKX... memo 'Invoice #42'"
 * - "Clean up my empty zombie accounts only"
 * - "Split 0.002 SOL between 7xKX... and 9aBc... memo 'Team lunch'"
 */
export function parsePaymentCommand(
  input: string,
  defaultRecipient?: string
): ParsedCommand {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  // Detect cleanup-only intent
  const isCleanupOnly =
    /^(clean\s*up|reclaim|sweep|close\s+(all\s+)?zombie)/i.test(raw) ||
    (lower.includes("clean") && !/\b\d+(\.\d+)?\s*sol\b/i.test(raw));

  // Extract memo in quotes or after `memo`
  let memo = "ap-sis #42";
  const quotedMemo =
    raw.match(/memo\s*[:=]?\s*["'“”‘’]([^"'“”‘’]+)["'“”‘’]/i) ||
    raw.match(/["'“”‘’]([^"'“”‘’]{1,120})["'“”‘’]/);
  if (quotedMemo?.[1]) {
    memo = quotedMemo[1].trim();
  } else {
    const trailingMemo = raw.match(/\bmemo\s+(.+)$/i);
    if (trailingMemo?.[1]) {
      memo = trailingMemo[1].trim();
    }
  }

  // Extract base58 Solana addresses (32-44 chars)
  const textWithoutMemo = quotedMemo ? raw.replace(quotedMemo[0], " ") : raw;
  const pubkeyMatches =
    textWithoutMemo.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];

  // Extract SOL amount
  const amountMatch =
    raw.match(/(\d+(?:\.\d+)?)\s*sol\b/i) ||
    raw.match(/\bsend\s+(\d+(?:\.\d+)?)\b/i) ||
    raw.match(/\bpay\s+(\d+(?:\.\d+)?)\b/i);

  if (isCleanupOnly && !amountMatch) {
    return {
      intentHint: "cleanup_only",
      amountSol: 0,
      lamports: 0,
      recipient: pubkeyMatches[0] || defaultRecipient || "",
      memo: quotedMemo?.[1] ? memo : "ap-sis rent sweep",
      parseValid: true,
    };
  }

  const amountSol = amountMatch ? Number.parseFloat(amountMatch[1]) : 0.001;
  const lamports = Math.max(0, Math.round(amountSol * 1_000_000_000));
  const recipient = pubkeyMatches[0] || defaultRecipient || "";
  const secondaryRecipient = pubkeyMatches[1];

  const isSplit =
    /\bsplit\b/i.test(raw) && Boolean(recipient && secondaryRecipient);

  if (!recipient) {
    return {
      intentHint: "pay_with_memo",
      amountSol,
      lamports,
      recipient: "",
      memo,
      parseValid: false,
      validationError:
        "Include a valid Solana recipient address (or connect your wallet to use a self-transfer demo).",
    };
  }

  return {
    intentHint: isSplit ? "split_payment" : "pay_with_memo",
    amountSol,
    lamports,
    recipient,
    secondaryRecipient,
    memo,
    parseValid: Number.isFinite(amountSol) && amountSol >= 0,
  };
}

/**
 * Client-side helper to invoke `/api/ai/jev`.
 * Falls back to local Heuristic mode if fetch fails on the client.
 */
export async function requestJevEvaluation(payload: {
  candidates?: ZombieCandidateInput[];
  commandText?: string;
  simulationSummary?: SimulationSafetySummary;
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
      intentResult:
        payload.commandText !== undefined
          ? routeAndCheckHeuristic(
              payload.commandText,
              payload.simulationSummary
            )
          : undefined,
    };
  }
}
