import { NextResponse } from "next/server";
import {
  TypeSafeClient,
  choice,
  noul,
  type ChoiceResponse,
  type NoulResponse,
  type Questions,
} from "@typesafe-ai/sdk";
import {
  PINNED_JEV_MODEL,
  classifyZombiesHeuristic,
  evaluateClosePolicy,
  routeAndCheckHeuristic,
  type IntentAndSafetyResult,
  type IntentKind,
  type JevApiResponse,
  type SimulationSafetySummary,
  type TokenKind,
  type ZombieCandidateInput,
  type ZombieClassification,
} from "@/lib/jev";

const JEV_TIMEOUT_MS = 3500;

interface JevRequestBody {
  candidates?: ZombieCandidateInput[];
  commandText?: string;
  simulationSummary?: SimulationSafetySummary;
}

const TOKEN_KIND_CRITERIA = {
  spam_airdrop:
    "Unsolicited promotional, dust, or scam airdrop token with no utility to the holder",
  dead_or_test_token:
    "Abandoned test mint, disposable Devnet test token, or inactive zero-activity token",
  stablecoin:
    "Fiat-pegged stablecoin such as USDC, USDT, or PYUSD used for recurring payments",
  major_asset:
    "Liquid ecosystem token such as wrapped SOL, JUP, BONK, or RAY",
  unknown:
    "Unverified or ambiguous token where automatic closure carries risk",
} as const;

const INTENT_CRITERIA = {
  pay_with_memo:
    "Send a single SOL payment to one recipient address with an optional invoice/reference memo",
  split_payment:
    "Split a SOL payment across two recipient addresses with a shared memo",
  cleanup_only:
    "Reclaim rent from empty zombie token accounts without sending SOL to an external recipient",
  unsupported:
    "Request outside payment or token-account rent cleanup scope",
} as const;

export async function POST(request: Request) {
  const startTime = performance.now();
  let body: JevRequestBody = {};

  try {
    body = (await request.json()) as JevRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const commandText =
    typeof body.commandText === "string" ? body.commandText : undefined;
  const simulationSummary = body.simulationSummary;

  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    const latencyMs = Math.round(performance.now() - startTime);
    const fallbackResponse: JevApiResponse = {
      mode: "heuristic",
      model: "heuristic-rules-v2",
      latencyMs,
      fallbackReason: "TYPESAFE_API_KEY not configured",
      classifications:
        candidates.length > 0
          ? classifyZombiesHeuristic(candidates)
          : undefined,
      intentResult:
        commandText !== undefined
          ? routeAndCheckHeuristic(commandText, simulationSummary)
          : undefined,
    };
    return NextResponse.json(fallbackResponse);
  }

  try {
    const client = new TypeSafeClient({
      apiKey,
      defaultModel: PINNED_JEV_MODEL,
      timeout: JEV_TIMEOUT_MS,
      retry: { maxRetries: 0 },
    });

    let classifications: ZombieClassification[] | undefined;
    let intentResult: IntentAndSafetyResult | undefined;
    let resolvedModel = PINNED_JEV_MODEL;

    // Call 1 — Batched Zombie Account Classifier (one systemOne call for all candidate accounts)
    if (candidates.length > 0) {
      const questions: Questions = {};
      const stateCandidates = candidates.map((c, idx) => {
        questions[`acct_${idx}_kind`] = choice(
          `For candidate index ${idx} (mint ${c.mint}), what kind of SPL token is this empty account?`,
          TOKEN_KIND_CRITERIA
        );
        questions[`acct_${idx}_receive_again`] = noul(
          `For candidate index ${idx} (mint ${c.mint}), is the wallet owner likely to receive this token again soon?`,
          {
            true: "Recurring payment token, active stablecoin, or frequently used ecosystem asset the user will receive again",
            false:
              "One-off disposable Devnet test mint, zero-supply test token, or spam airdrop that the owner will not receive again",
          }
        );

        return {
          index: idx,
          account: c.address,
          mint: c.mint,
          name:
            c.name ||
            (c.isTestMintFromCache
              ? "ap-sis Disposable Devnet Test Mint"
              : "Unlabeled SPL Token"),
          symbol: c.symbol || (c.isTestMintFromCache ? "ZOMBIE-TEST" : "SPL"),
          uri: c.uri || null,
          decimals: c.decimals,
          supply: c.supply ?? "unknown",
          recentSignaturesCount: c.recentSignaturesCount ?? 1,
          isKnownStablecoin: c.isKnownStablecoin,
          isDisposableDevnetTestMint: c.isTestMintFromCache,
          contextNote: c.isTestMintFromCache
            ? "Created by ap-sis Devnet seeder solely as a disposable 0-balance test token account for rent reclamation; owner will never receive tokens on this account again."
            : c.isKnownStablecoin
              ? "Known stablecoin mint used for standard payments."
              : "Standard empty SPL token account with zero token balance.",
        };
      });

      const res = await client.systemOne({
        model: PINNED_JEV_MODEL,
        state: {
          network: "solana-devnet",
          task: "Evaluate empty (0-balance) SPL token accounts for safe CloseAccount rent reclamation",
          candidates: stateCandidates,
        },
        questions,
      });

      resolvedModel = res.model || PINNED_JEV_MODEL;

      classifications = candidates.map((c, idx) => {
        const kindAns = res.answers[`acct_${idx}_kind`] as
          | ChoiceResponse<typeof TOKEN_KIND_CRITERIA>
          | undefined;
        const receiveAns = res.answers[`acct_${idx}_receive_again`] as
          | NoulResponse
          | undefined;

        const tokenKind: TokenKind = kindAns?.choice ?? "unknown";
        const kindConfidence =
          typeof kindAns?.confidence === "number" ? kindAns.confidence : null;
        const kindProbabilities = kindAns?.probabilities
          ? { ...kindAns.probabilities }
          : null;
        const willReceiveAgain =
          typeof receiveAns?.noul === "number" ? receiveAns.noul : 0.5;

        // Deterministic code policy decides whether to close (never raw LLM vibes)
        // Also protect known stablecoins regardless of model output
        if (c.isKnownStablecoin) {
          return {
            address: c.address,
            mint: c.mint,
            tokenKind: "stablecoin",
            kindConfidence,
            kindProbabilities,
            willReceiveAgain,
            shouldClose: false,
            reason: "Protected stablecoin allow-list (kept unless opted in)",
            source: "jev",
          };
        }

        const decision = evaluateClosePolicy(tokenKind, willReceiveAgain);
        return {
          address: c.address,
          mint: c.mint,
          tokenKind,
          kindConfidence,
          kindProbabilities,
          willReceiveAgain,
          shouldClose: decision.shouldClose,
          reason: decision.reason,
          source: "jev",
        };
      });
    }

    // Call 2 — Intent Router + Pre-Sign Advisory Check
    if (commandText !== undefined) {
      const intentQuestions: Questions = {
        intent: choice(
          "Classify the user's Solana transaction command into the matching execution route.",
          INTENT_CRITERIA
        ),
      };

      if (simulationSummary) {
        intentQuestions.is_safe_to_sign = noul(
          "Given the pre-flight simulation result and balance-diff summary, does this transaction match the user's payment intent without unexpected balance drain or simulation failure?",
          {
            true: "Simulation succeeded (ok: true), logs show clean execution, and net balance change equals transfer minus fees plus reclaimed rent",
            false:
              "Simulation failed, logs contain runtime errors, or balance drain exceeds the requested transfer and network fee",
          }
        );
      }

      const res2 = await client.systemOne({
        model: PINNED_JEV_MODEL,
        state: {
          commandText,
          simulationSummary: simulationSummary
            ? {
                ok: simulationSummary.ok,
                unitsConsumed: simulationSummary.unitsConsumed,
                logsTail: simulationSummary.logsTail,
                transferLamports: simulationSummary.transferLamports,
                feeLamports: simulationSummary.feeLamports,
                reclaimedLamports: simulationSummary.reclaimedLamports,
                netLamports: simulationSummary.netLamports,
                closesCount: simulationSummary.closesCount,
                recipient: simulationSummary.recipient,
              }
            : null,
        },
        questions: intentQuestions,
      });

      resolvedModel = res2.model || resolvedModel;

      const intentAns = res2.answers.intent as
        | ChoiceResponse<typeof INTENT_CRITERIA>
        | undefined;
      const safeAns = res2.answers.is_safe_to_sign as NoulResponse | undefined;

      const intent: IntentKind = intentAns?.choice ?? "pay_with_memo";
      const safeProb =
        typeof safeAns?.noul === "number" ? safeAns.noul : null;
      const simOk = simulationSummary ? simulationSummary.ok : true;

      // Advisory badge: never overrides a failed simulation
      const isSafeAdvisory = simOk && (safeProb === null || safeProb >= 0.5);

      intentResult = {
        intent,
        intentConfidence:
          typeof intentAns?.confidence === "number"
            ? intentAns.confidence
            : null,
        intentProbabilities: intentAns?.probabilities
          ? { ...intentAns.probabilities }
          : null,
        safeToSignProbability: safeProb,
        isSafeAdvisory,
        advisoryNote: !simOk
          ? "Simulation failed — transaction blocked from signing."
          : safeProb !== null
            ? `Jev pre-sign check: ${(safeProb * 100).toFixed(0)}% safe-to-sign probability on simulated logs & balance diff.`
            : `Jev routed command as ${intent.replace(/_/g, " ")}.`,
        source: "jev",
      };
    }

    const latencyMs = Math.round(performance.now() - startTime);
    const response: JevApiResponse = {
      mode: "jev",
      model: resolvedModel,
      latencyMs,
      classifications,
      intentResult,
    };

    return NextResponse.json(response);
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    const fallbackResponse: JevApiResponse = {
      mode: "heuristic",
      model: "heuristic-rules-v2",
      latencyMs,
      fallbackReason:
        err instanceof Error ? err.message : "Jev API request failed",
      classifications:
        candidates.length > 0
          ? classifyZombiesHeuristic(candidates)
          : undefined,
      intentResult:
        commandText !== undefined
          ? routeAndCheckHeuristic(commandText, simulationSummary)
          : undefined,
    };
    return NextResponse.json(fallbackResponse);
  }
}

export async function GET() {
  const startTime = performance.now();
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      mode: "heuristic",
      model: "heuristic-rules-v2",
      latencyMs: 0,
      fallbackReason: "TYPESAFE_API_KEY missing",
    });
  }

  try {
    const client = new TypeSafeClient({
      apiKey,
      defaultModel: PINNED_JEV_MODEL,
      timeout: JEV_TIMEOUT_MS,
      retry: { maxRetries: 0 },
    });
    const models = await client.models.list();
    const latencyMs = Math.round(performance.now() - startTime);
    return NextResponse.json({
      mode: "jev",
      model: PINNED_JEV_MODEL,
      availableModels: models.map((m) => m.name),
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return NextResponse.json({
      mode: "heuristic",
      model: "heuristic-rules-v2",
      latencyMs,
      fallbackReason:
        err instanceof Error ? err.message : "Jev health check failed",
    });
  }
}
