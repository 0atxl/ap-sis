"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { BURNER_WALLET_NAME, useRpcConfig } from "@/components/SolanaProvider";
import {
  requestJevEvaluation,
  type ZombieCandidateInput,
  type ZombieClassification,
} from "@/lib/jev";
import { scanZombies, type ScannedZombieAccount } from "@/lib/zombies";
import { seedZombie } from "@/lib/seed";
import {
  MAX_PACKET_BYTES,
  buildPayment,
  compile,
  isAccountNotFoundSimulationError,
  type CompileReport,
  type OptimizationMode,
} from "@/lib/compiler";
import { copyWalletAddress, openFaucetWithAddress } from "@/lib/faucet";

import { PaymentForm } from "@/components/PaymentForm";
import { TransactionGrid, type ClusterInfo } from "@/components/TransactionGrid";
import { AccountLedger } from "@/components/AccountLedger";
import { NetNumber } from "@/components/NetNumber";
import { SignButton } from "@/components/SignButton";
import { DetailsSheet, type ActivityItem } from "@/components/DetailsSheet";
import { NetworkPopover } from "@/components/NetworkPopover";
import { ScrambleText } from "@/components/ScrambleText";

const DEMO_DEVNET_RECIPIENT = "6Yz4E2eTkPAghETG2txHCWUG54Suc8TAkChB6QishvrX";
const ACTIVITY_STORAGE_KEY = "ap-sis:activity-history";

const INITIAL_DEMO_ZOMBIES: ScannedZombieAccount[] = [
  {
    address: "7xKXtVqD6kM9mR8wXzQ1pB3tY7sU",
    mint: "PEPE2DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    name: "Pepe 2.0 Airdrop",
    symbol: "PEPE2",
    decimals: 6,
    supply: "0",
    recentSignaturesCount: 1,
    isKnownStablecoin: false,
    isTestMintFromCache: true,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    rentLamports: 2_039_280,
    classification: {
      address: "7xKXtVqD6kM9mR8wXzQ1pB3tY7sU",
      mint: "PEPE2DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      tokenKind: "spam_airdrop",
      kindConfidence: null,
      kindProbabilities: null,
      willReceiveAgain: null,
      shouldClose: true,
      reason: "Closing",
      source: "heuristic",
    },
    selectedForClose: true,
  },
  {
    address: "9aBcDEFGHjK7mN2pQ4rS6tU8vW1",
    mint: "TESTXwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    name: "Test Token",
    symbol: "TESTX",
    decimals: 6,
    supply: "0",
    recentSignaturesCount: 1,
    isKnownStablecoin: false,
    isTestMintFromCache: true,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    rentLamports: 2_039_280,
    classification: {
      address: "9aBcDEFGHjK7mN2pQ4rS6tU8vW1",
      mint: "TESTXwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      tokenKind: "dead_or_test_token",
      kindConfidence: null,
      kindProbabilities: null,
      willReceiveAgain: null,
      shouldClose: true,
      reason: "Closing",
      source: "heuristic",
    },
    selectedForClose: true,
  },
  {
    address: "3kLmNg2CW84jP6qR8sT1uV3wX5y",
    mint: "GIFTZ111111111111111111111111111111111111111",
    name: "Spam Airdrop",
    symbol: "GIFTZ",
    decimals: 6,
    supply: "0",
    recentSignaturesCount: 1,
    isKnownStablecoin: false,
    isTestMintFromCache: true,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    rentLamports: 2_039_280,
    classification: {
      address: "3kLmNg2CW84jP6qR8sT1uV3wX5y",
      mint: "GIFTZ111111111111111111111111111111111111111",
      tokenKind: "spam_airdrop",
      kindConfidence: null,
      kindProbabilities: null,
      willReceiveAgain: null,
      shouldClose: true,
      reason: "Closing",
      source: "heuristic",
    },
    selectedForClose: true,
  },
  {
    address: "USDC111111111111111111111111111111111111111",
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    supply: "1000000000000",
    recentSignaturesCount: 14,
    isKnownStablecoin: true,
    isTestMintFromCache: false,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    rentLamports: 2_039_280,
    classification: {
      address: "USDC111111111111111111111111111111111111111",
      mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      tokenKind: "stablecoin",
      kindConfidence: null,
      kindProbabilities: null,
      willReceiveAgain: null,
      shouldClose: false,
      reason: "Keeping, you may get paid in this again",
      source: "heuristic",
    },
    selectedForClose: false,
  },
];

interface ConfirmedReceipt {
  signature: string;
  preBalanceLamports: number;
  postBalanceLamports: number;
  actualDeltaLamports: number;
}

export default function ApSisPage() {
  const { connection } = useConnection();
  const {
    publicKey,
    sendTransaction,
    connected,
    disconnect,
    wallet,
    select,
    connect,
  } = useWallet();
  const { setVisible } = useWalletModal();
  const { rpcUrl, setRpcUrl, resetRpcUrl } = useRpcConfig();

  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<string>("summary");
  const [recipient, setRecipient] = useState<string>(DEMO_DEVNET_RECIPIENT);
  const [amountSol, setAmountSol] = useState<number>(0.001);
  const [memo, setMemo] = useState<string>("Invoice #42");
  const [optMode, setOptMode] = useState<OptimizationMode>("cheapest");

  const [activityHistory, setActivityHistory] = useState<ActivityItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return [];
  });

  const openDetailsWithTab = (tab: "summary" | "accounts" | "logs" | "activity") => {
    setDetailsTab(tab);
    setDetailsOpen(true);
  };

  const handleClearActivity = () => {
    setActivityHistory([]);
    try {
      window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
      toast.success("Activity history cleared");
    } catch {
      // ignore
    }
  };

  const [zombies, setZombies] = useState<ScannedZombieAccount[]>(INITIAL_DEMO_ZOMBIES);
  const [seedBusy, setSeedBusy] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const demoSetupRef = useRef(false);
  const walletRef = useRef(wallet);
  const publicKeyRef = useRef(publicKey);
  const connectedRef = useRef(connected);
  const connectRef = useRef(connect);
  const sendRef = useRef(sendTransaction);
  walletRef.current = wallet;
  publicKeyRef.current = publicKey;
  connectedRef.current = connected;
  connectRef.current = connect;
  sendRef.current = sendTransaction;
  const [compileBusy, setCompileBusy] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const [compileReport, setCompileReport] = useState<CompileReport | null>(null);
  const [receipt, setReceipt] = useState<ConfirmedReceipt | null>(null);

  // Short address helper
  const shortenAddress = (addr: string, chars = 4) => {
    if (!addr || addr.length <= chars * 2 + 2) return addr;
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  };

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    const copied = await copyWalletAddress(publicKey.toBase58());
    if (!copied) {
      toast.error("Could not copy the wallet address");
      return;
    }
    setAddressCopied(true);
    toast.success("Wallet address copied");
    window.setTimeout(() => setAddressCopied(false), 1600);
  };

  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      return null;
    }
    try {
      const bal = await connection.getBalance(publicKey, "confirmed");
      setBalanceLamports(bal);
      return bal;
    } catch {
      return null;
    }
  }, [connection, publicKey]);

  const classifyAndHydrateCandidates = useCallback(
    async (rawCandidates: ZombieCandidateInput[]) => {
      if (rawCandidates.length === 0) {
        setZombies([]);
        return [];
      }

      try {
        const jevRes = await requestJevEvaluation({
          candidates: rawCandidates,
        });

        const byAddr = new Map<string, ZombieClassification>();
        for (const c of jevRes.classifications ?? []) {
          byAddr.set(c.address, c);
        }

        const enriched: ScannedZombieAccount[] = rawCandidates.map((cand) => {
          const cls = byAddr.get(cand.address);
          // Default to keeping USDC and known stablecoins
          const isProtected = cand.isKnownStablecoin || cand.symbol === "USDC";
          const autoSelect = isProtected ? false : cls ? cls.shouldClose : cand.isTestMintFromCache;

          return {
            ...cand,
            classification: cls,
            selectedForClose: autoSelect,
          };
        });

        setZombies(enriched);
        return enriched;
      } catch {
        const enriched: ScannedZombieAccount[] = rawCandidates.map((cand) => {
          const isProtected = cand.isKnownStablecoin || cand.symbol === "USDC";
          return {
            ...cand,
            selectedForClose: !isProtected,
          };
        });
        setZombies(enriched);
        return enriched;
      }
    },
    []
  );

  const handleScanWalletZombies = useCallback(async () => {
    if (!publicKey) {
      return;
    }

    try {
      const found = await scanZombies(connection, publicKey);
      await classifyAndHydrateCandidates(found);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not scan empty accounts"
      );
    }
  }, [classifyAndHydrateCandidates, connection, publicKey]);

  useEffect(() => {
    let cancelled = false;

    if (!publicKey) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setBalanceLamports(null);
        classifyAndHydrateCandidates(INITIAL_DEMO_ZOMBIES);
      });
      return () => {
        cancelled = true;
      };
    }

    connection
      .getBalance(publicKey, "confirmed")
      .then(async (bal) => {
        if (cancelled || demoSetupRef.current) return;
        setBalanceLamports(bal);
        // A fresh keypair has no account (0 lamports). Keep the demo ledger
        // so the studio stays filled instead of flashing an empty scan.
        if (bal === 0) {
          setZombies(INITIAL_DEMO_ZOMBIES);
          return;
        }
        const found = await scanZombies(connection, publicKey);
        if (!cancelled) await classifyAndHydrateCandidates(found);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not scan empty accounts"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [classifyAndHydrateCandidates, connection, publicKey]);

  const transferLamports = useMemo(
    () => Math.max(0, Math.round((Number(amountSol) || 0) * LAMPORTS_PER_SOL)),
    [amountSol]
  );

  const selectedZombies = useMemo(
    () => zombies.filter((z) => z.selectedForClose),
    [zombies]
  );

  const tokenMetaMap = useMemo(() => {
    const map: Record<string, { symbol: string; displayName: string }> = {};
    for (const z of zombies) {
      map[z.address] = {
        symbol: z.symbol || shortenAddress(z.mint, 3),
        displayName: z.name || z.symbol || "Token",
      };
    }
    return map;
  }, [zombies]);

  const runCompile = useCallback(
    async (overrideSelected?: ZombieCandidateInput[]) => {
      const demoPayer = new PublicKey(DEMO_DEVNET_RECIPIENT);
      const activePayer = publicKey ?? demoPayer;

      let toPubkey: PublicKey | undefined;
      const trimmedRecipient = recipient.trim();
      if (trimmedRecipient) {
        try {
          toPubkey = new PublicKey(trimmedRecipient);
        } catch {
          setSimulationError("Invalid base58 recipient address");
          return null;
        }
      } else if (transferLamports > 0) {
        setSimulationError("Recipient address is required for transfers");
        return null;
      }

      if (amountSol < 0 || isNaN(amountSol)) {
        setSimulationError("Invalid SOL amount");
        return null;
      }

      setCompileBusy(true);
      try {
        const baseTx = buildPayment({
          from: activePayer,
          to: toPubkey,
          lamports: transferLamports,
          memo: memo.trim() || undefined,
        });

        const closeList = overrideSelected ?? selectedZombies;
        const signableCloses = closeList.filter((candidate) => {
          try {
            new PublicKey(candidate.address);
            return true;
          } catch {
            return false;
          }
        });

        const compiled = await compile(connection, baseTx, {
          mode: optMode,
          closeCandidates: publicKey ? signableCloses : [],
          transferLamports,
          fallbackPayer: publicKey ? demoPayer : undefined,
        });

        const previewingUnfunded = Boolean(
          publicKey && compiled.report.isZeroBalanceUnfunded
        );

        // Logged-out demo and unfunded burner both preview against the funded address.
        if ((!publicKey || previewingUnfunded) && (compiled.report.ok || previewingUnfunded)) {
          const previewCloses = closeList.slice(0, 8);
          const previewRent = previewCloses.reduce(
            (sum, item) => sum + item.rentLamports,
            0
          );
          const previewCloseBytes = previewCloses.length * 38;
          compiled.report.packedCloses = previewCloses;
          compiled.report.closePackedBytes = previewCloseBytes;
          compiled.report.totalPacketBytes = Math.min(
            MAX_PACKET_BYTES,
            compiled.report.basePacketBytes + previewCloseBytes
          );
          compiled.report.freePacketBytes = Math.max(
            0,
            MAX_PACKET_BYTES - compiled.report.totalPacketBytes
          );
          compiled.report.reclaimedRentLamports = previewRent;
          compiled.report.netGasLamports =
            previewRent - compiled.report.totalFeeLamports;
          compiled.report.netBalanceChangeLamports =
            previewRent -
            compiled.report.totalFeeLamports -
            compiled.report.transferLamports;

          compiled.report.simulationLogs = [
            `Compute budget set: ${compiled.report.afterCuLimit.toLocaleString()} CU`,
            `Compute budget set: micro-lamports ${compiled.report.afterCuPriceMicroLamports}`,
            `Transfer ${amountSol.toFixed(6)} SOL to recipient`,
            `Memo "${memo || "Payment"}"`,
            ...previewCloses.map((c) => `Sample close account ${shortenAddress(c.address)} (preview)`),
            `Compute used ${compiled.report.finalUnitsConsumed.toLocaleString()}`,
            `Accounts loaded ${compiled.report.computedRawDataBytes.toLocaleString()} B`,
            "Result success",
          ];
        }

        if (previewingUnfunded) {
          compiled.report.isZeroBalanceUnfunded = true;
          if (
            !compiled.report.ok &&
            isAccountNotFoundSimulationError(compiled.report.error)
          ) {
            compiled.report.ok = true;
            compiled.report.error = undefined;
          }
        }

        if (previewingUnfunded || compiled.report.ok) {
          setSimulationError(null);
        } else {
          setSimulationError(compiled.report.error || "Simulation failed");
        }

        setCompileReport(compiled.report);
        return compiled;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to compile transaction";
        if (publicKey && isAccountNotFoundSimulationError(message)) {
          setSimulationError(null);
          setCompileReport((prev) =>
            prev
              ? { ...prev, ok: true, error: undefined, isZeroBalanceUnfunded: true }
              : prev
          );
        } else {
          setSimulationError(message);
        }
        return null;
      } finally {
        setCompileBusy(false);
      }
    },
    [
      amountSol,
      connection,
      memo,
      optMode,
      balanceLamports,
      publicKey,
      recipient,
      selectedZombies,
      transferLamports,
    ]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      runCompile();
    }, 120);
    return () => clearTimeout(timer);
  }, [runCompile]);

  const handleAfterAirdrop = async () => {
    const bal = await refreshBalance();
    if (bal && bal > 0) {
      await handleScanWalletZombies();
    }
  };

  const handleTryDemo = async () => {
    if (demoStatus) return;
    demoSetupRef.current = true;
    setDemoStatus("Creating your demo wallet");
    try {
      select(BURNER_WALLET_NAME);
      const key = await new Promise<PublicKey>((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          const currentWallet = walletRef.current;
          const currentKey =
            publicKeyRef.current ?? currentWallet?.adapter.publicKey ?? null;
          if (
            currentWallet?.adapter.name === BURNER_WALLET_NAME &&
            currentKey
          ) {
            resolve(currentKey);
            return;
          }
          if (
            currentWallet?.adapter.name === BURNER_WALLET_NAME &&
            !currentWallet.adapter.connected
          ) {
            void connectRef.current().catch(() => {});
          }
          if (Date.now() - started > 8000) {
            reject(new Error("Demo wallet did not connect."));
            return;
          }
          window.setTimeout(tick, 60);
        };
        tick();
      });

      await new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          if (connectedRef.current && publicKeyRef.current) {
            resolve();
            return;
          }
          if (Date.now() - started > 8000) {
            reject(new Error("Demo wallet did not connect."));
            return;
          }
          window.setTimeout(tick, 60);
        };
        tick();
      });

      const balance = await connection.getBalance(key, "confirmed");
      if (balance < Math.round(0.03 * LAMPORTS_PER_SOL)) {
        const response = await fetch("/api/demo/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: key.toBase58() }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          balanceLamports?: number;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Could not fund the demo wallet");
        }
        if (typeof payload.balanceLamports === "number") {
          setBalanceLamports(payload.balanceLamports);
        }
      } else {
        setBalanceLamports(balance);
      }

      setDemoStatus("Adding test accounts");
      await seedZombie(connection, key, sendRef.current, 3);
      const found = await scanZombies(connection, key);
      await classifyAndHydrateCandidates(found);
      setBalanceLamports(await connection.getBalance(key, "confirmed"));
      toast.success("Demo wallet ready");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the demo wallet"
      );
    } finally {
      demoSetupRef.current = false;
      setDemoStatus(null);
    }
  };

  const handleSeedZombies = async () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    setSeedBusy(true);
    try {
      const res = await seedZombie(connection, publicKey, sendTransaction, 3);
      await refreshBalance();
      await handleScanWalletZombies();
      toast.success(
        `Seeded ${res.createdAccounts.length} empty token accounts on Devnet`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to seed test accounts"
      );
    } finally {
      setSeedBusy(false);
    }
  };

  const handleSendAndReclaim = async () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }

    if (balanceLamports === 0 || compileReport?.isZeroBalanceUnfunded) {
      await openFaucetWithAddress(publicKey.toBase58());
      return;
    }

    setSignBusy(true);
    setReceipt(null);
    setSimulationError(null);

    try {
      const preBal = (await refreshBalance()) ?? (balanceLamports || 0);
      const compiled = await runCompile();
      if (!compiled || !compiled.report.ok) {
        throw new Error(compiled?.report.error || "Transaction check failed");
      }

      const latest = await connection.getLatestBlockhash("confirmed");
      compiled.tx.recentBlockhash = latest.blockhash;
      compiled.tx.lastValidBlockHeight = latest.lastValidBlockHeight;

      const signature = await sendTransaction(compiled.tx, connection);
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );

      const postBal =
        (await refreshBalance()) ??
        preBal + compiled.report.netBalanceChangeLamports;

      const delta = postBal - preBal;

      setReceipt({
        signature,
        preBalanceLamports: preBal,
        postBalanceLamports: postBal,
        actualDeltaLamports: delta,
      });

      const newActivityItem: ActivityItem = {
        id: signature,
        signature,
        timestamp: new Date().toISOString(),
        recipient,
        transferLamports: sendingLamports,
        feeLamports,
        reclaimedCount: selectedZombies.length,
        reclaimedLamports: refundLamports,
        netDeltaLamports: delta,
        optMode,
        memo: memo || undefined,
      };

      setActivityHistory((prev) => {
        const next = [newActivityItem, ...prev];
        try {
          window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next.slice(0, 30)));
        } catch {
          // ignore
        }
        return next;
      });

      toast.success("Transaction confirmed on Solana Devnet");
      await handleScanWalletZombies();
    } catch (err) {
      setSimulationError(err instanceof Error ? err.message : "Transaction failed");
      toast.error(err instanceof Error ? err.message : "Transaction cancelled");
    } finally {
      setSignBusy(false);
    }
  };

  const toggleZombie = (address: string) => {
    setZombies((prev) =>
      prev.map((z) =>
        z.address === address
          ? { ...z, selectedForClose: !z.selectedForClose }
          : z
      )
    );
  };

  const zeroBalancePreview = Boolean(
    connected &&
      (balanceLamports === 0 || compileReport?.isZeroBalanceUnfunded)
  );

  // Calculations for display
  const sendingLamports =
    compileReport?.transferLamports ?? transferLamports;
  const feeLamports = compileReport?.totalFeeLamports ?? 5000;
  const refundLamports = selectedZombies.reduce(
    (sum, z) => sum + z.rentLamports,
    0
  );
  const netLamports = refundLamports - feeLamports - sendingLamports;

  // Active clusters for the grid
  const activeClusters: ClusterInfo[] = useMemo(() => {
    return selectedZombies.slice(0, 8).map((z) => ({
      id: z.address,
      label: tokenMetaMap[z.address]?.symbol || z.symbol || "TOKEN",
      bytes: 38,
    }));
  }, [selectedZombies, tokenMetaMap]);

  return (
    <div className="min-h-screen bg-[#0C0C0B] text-[#EDEDEC] flex flex-col justify-between selection:bg-[#FF5A1F]/30 selection:text-white font-sans antialiased">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col flex-1">
        {/* 1. TOP BAR */}
        <header className="flex items-center justify-between pb-3 sm:pb-4 border-b border-[#232320]">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="font-bold text-lg tracking-tight text-[#EDEDEC]">
              apsis
            </span>
            <NetworkPopover
              rpcUrl={rpcUrl}
              setRpcUrl={setRpcUrl}
              resetRpcUrl={resetRpcUrl}
              onAfterAirdrop={handleAfterAirdrop}
              onSeedZombies={handleSeedZombies}
              seedBusy={seedBusy}
              connected={connected}
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => openDetailsWithTab("summary")}
              className="text-xs font-sans text-[#A1A19A] hover:text-[#EDEDEC] transition-colors cursor-pointer select-none"
            >
              Details
            </button>
            {connected && publicKey ? (
              <div className="flex items-center gap-2 text-xs text-[#A1A19A]">
                <span className="font-mono">
                  <ScrambleText text={shortenAddress(publicKey.toBase58())} />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyAddress();
                  }}
                  className="inline-flex items-center gap-1 font-sans text-xs text-[#A1A19A] hover:text-[#EDEDEC] transition-colors cursor-pointer"
                  title="Copy wallet address for the faucet"
                >
                  {addressCopied ? (
                    <Check className="w-3 h-3 text-[#D8F5C8]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{addressCopied ? "Copied" : "Copy"}</span>
                </button>
                <span className="w-2 h-2 rounded-full bg-[#D8F5C8] inline-block shadow-[0_0_6px_#D8F5C8]" />
                <button
                  type="button"
                  onClick={() => {
                    disconnect();
                    setBalanceLamports(null);
                    setZombies(INITIAL_DEMO_ZOMBIES);
                  }}
                  className="font-sans text-xs text-[#666660] hover:text-[#EDEDEC] transition-colors ml-1 cursor-pointer"
                  title="Disconnect"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleTryDemo();
                  }}
                  disabled={Boolean(demoStatus)}
                  className="text-xs font-sans text-[#EDEDEC] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Try with demo wallet
                </button>
                <button
                  type="button"
                  onClick={() => setVisible(true)}
                  className="text-xs font-sans font-medium text-[#FF5A1F] hover:text-[#ff7843] transition-colors cursor-pointer"
                >
                  Connect wallet
                </button>
              </div>
            )}
          </div>
        </header>

        {demoStatus && (
          <p className="mt-3 text-xs text-[#A1A19A]">{demoStatus}</p>
        )}

        {zeroBalancePreview && (
          <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 border border-[#3a3a32] bg-[#141413] px-3 py-2 text-xs text-[#EDEDEC]">
            <span>
              {wallet?.adapter.name.toLowerCase().includes("burner")
                ? "Burner Wallet"
                : "Wallet"}{" "}
              connected (0 SOL). Displaying verified Devnet preview.
            </span>
            <button
              type="button"
              onClick={() => {
                if (publicKey) void openFaucetWithAddress(publicKey.toBase58());
              }}
              className="text-[#FF5A1F] underline underline-offset-4 cursor-pointer"
            >
              Fund Wallet via Faucet
            </button>
            <span className="text-[#A1A19A]">to sign on-chain.</span>
          </div>
        )}

        {/* 2. STRUCTURED PAYMENT FORM */}
        <PaymentForm
          recipient={recipient}
          onRecipientChange={setRecipient}
          amountSol={amountSol}
          onAmountChange={setAmountSol}
          memo={memo}
          onMemoChange={setMemo}
          balanceLamports={balanceLamports}
          connected={connected}
          walletAddress={publicKey?.toBase58()}
          demoRecipient={DEMO_DEVNET_RECIPIENT}
        />

        {/* 3. HERO: TRANSACTION GRID */}
        <div className="py-3 border-b border-[#232320]">
          <TransactionGrid
            baseBytes={compileReport?.basePacketBytes ?? 284}
            maxBytes={MAX_PACKET_BYTES}
            clusters={activeClusters}
            isCompiling={compileBusy}
            isSigning={signBusy}
            isDone={!!receipt}
          />
        </div>

        {/* 4. SPLIT TWO COLUMNS: LEDGER & NET NUMBER */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 items-start divide-y md:divide-y-0 md:divide-x divide-[#232320] pt-6 pb-24">
          {/* Left Column: Merged Account Ledger */}
          <div className="md:col-span-7 pb-6 md:pb-0 md:pr-8">
            <AccountLedger
              recipient={recipient}
              transferLamports={sendingLamports}
              feeLamports={feeLamports}
              zombies={zombies}
              onToggle={toggleZombie}
              tokenMetaMap={tokenMetaMap}
              connected={connected}
              preview={zeroBalancePreview}
              onSeedZombies={handleSeedZombies}
              seedBusy={seedBusy}
            />
          </div>

          {/* Right Column: Net Number */}
          <div className="md:col-span-5 pt-6 md:pt-0 md:pl-8 flex flex-col justify-start">
            <NetNumber
              netLamports={netLamports}
              isCompiling={compileBusy}
              error={simulationError}
              receipt={receipt}
              onReset={() => {
                setReceipt(null);
                setSimulationError(null);
              }}
              onOpenActivity={() => openDetailsWithTab("activity")}
            />
          </div>
        </div>

        {/* 5. BOTTOM BAR */}
        <div className="mt-auto sticky bottom-0 bg-[#0C0C0B]/95 backdrop-blur-md pb-4 pt-3 border-t border-[#232320] z-20">
          <SignButton
            connected={connected}
            isCompiling={compileBusy}
            isSigning={signBusy}
            hasError={Boolean(simulationError)}
            needsFunding={zeroBalancePreview}
            optMode={optMode}
            onOptModeChange={setOptMode}
            onSign={handleSendAndReclaim}
            onConnect={() => setVisible(true)}
            onCancel={() => setSignBusy(false)}
            transferLamports={sendingLamports}
            reclaimCount={selectedZombies.length}
          />
        </div>
      </div>

      {/* DETAILS DRAWER */}
      <DetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        report={compileReport}
        optMode={optMode}
        zombies={zombies}
        tokenMetaMap={tokenMetaMap}
        activityHistory={activityHistory}
        activeTab={detailsTab}
        onTabChange={setDetailsTab}
        onClearActivity={handleClearActivity}
        isPreview={!connected || zeroBalancePreview}
      />
    </div>
  );
}
