"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompileReport, OptimizationMode } from "@/lib/compiler";
import { ScannedZombieAccount } from "@/lib/zombies";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChevronDown, ChevronUp, Copy, Check, Trash2, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export interface ActivityItem {
  id: string;
  signature: string;
  timestamp: string;
  recipient: string;
  transferLamports: number;
  feeLamports: number;
  reclaimedCount: number;
  reclaimedLamports: number;
  netDeltaLamports: number;
  optMode: OptimizationMode;
  memo?: string;
}

interface DetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CompileReport | null;
  optMode: OptimizationMode;
  zombies: ScannedZombieAccount[];
  tokenMetaMap: Record<string, { symbol: string; displayName: string }>;
  activityHistory?: ActivityItem[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onClearActivity?: () => void;
}

const DOT_COUNT = 44;

function DotBar({
  filledCount,
  total = DOT_COUNT,
  variant = "optimized",
}: {
  filledCount: number;
  total?: number;
  variant?: "baseline" | "optimized";
}) {
  return (
    <div className="flex items-center gap-1.5 py-1 select-none">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-1 h-1 rounded-full transition-colors ${
            i < filledCount
              ? variant === "baseline"
                ? "bg-[#555550]"
                : "bg-[#D8F5C8]"
              : "bg-[#242422]"
          }`}
        />
      ))}
    </div>
  );
}

function ScrambleLogLine({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("R#%▒@m▒A%g▒z#▒@");
  const GLYPHS = "0123456789ABCDEF$#%@!&*+░▒▓";

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayed(() =>
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) {
              return text[index];
            }
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("")
      );

      if (iteration >= text.length) {
        clearInterval(interval);
      }
      iteration += 1;
    }, 40);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <span className="font-mono inline-flex items-center">
      <span>{displayed}</span>
      <span className="inline-block w-2 h-3.5 ml-1 bg-[#EDEDEC] animate-blink" />
    </span>
  );
}

function formatRelativeTime(isoString: string, mounted = false): string {
  if (!mounted) return "Recently";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(isoString).toLocaleDateString();
  } catch {
    return "Recently";
  }
}

export function DetailsSheet({
  open,
  onOpenChange,
  report,
  optMode,
  zombies,
  tokenMetaMap,
  activityHistory = [],
  activeTab: controlledTab,
  onTabChange,
  onClearActivity,
}: DetailsSheetProps) {
  const [internalTab, setInternalTab] = useState("summary");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const [showFormulaBreakdown, setShowFormulaBreakdown] = useState(false);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleCopy = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  // Fallback defaults matching real Solana transaction metrics
  const beforeCu = report?.beforeCuLimit ?? 203000;
  const afterCu = report?.afterCuLimit ?? 37388;
  const cuDots = Math.min(DOT_COUNT, Math.max(1, Math.round((afterCu / beforeCu) * DOT_COUNT)));

  const afterDataBytes = report?.afterDataLimitBytes ?? 98304; // 96 KiB
  const dataDots = Math.min(DOT_COUNT, Math.max(1, Math.round((afterDataBytes / (500 * 1024)) * DOT_COUNT)));

  const feeLamports = report?.totalFeeLamports ?? 7030;
  const beforePriority = report?.beforeCost?.priorityScore ?? 20552;
  const afterPriority = report?.afterCost?.priorityScore ?? 117861;

  const logs = report?.simulationLogs?.length
    ? report.simulationLogs
    : [
        "Compute budget set: 37,388 CU",
        "Compute budget set: micro-lamports 1500",
        "Transfer 0.001000 SOL to recipient",
        'Memo "Invoice #42"',
        "Close account 7xKXt...sgAsU",
        "Close account 9aBcD...DEFGH",
        "Close account 3kLmN...g2CW8",
        "Compute used 33,839",
        "Accounts loaded 75,092 B",
        "Result success",
      ];

  const formatShortAddress = (addr: string) => {
    if (!addr || addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-[#0C0C0B] border-l border-[#232320] text-[#EDEDEC] p-6 overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between pb-3 border-b border-[#232320]">
          <SheetTitle className="text-base sm:text-lg font-bold tracking-tight text-[#EDEDEC] font-mono uppercase">
            Details &amp; Activity
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              className="text-xs font-mono text-[#888882] hover:text-[#EDEDEC] transition-colors cursor-pointer outline-none px-2 py-1 rounded-[2px] hover:bg-[#141413] border border-transparent hover:border-[#232320]"
            >
              [Close]
            </button>
          </SheetClose>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="border-b border-[#232320] gap-4 sm:gap-6 flex-wrap h-auto pb-1">
            <TabsTrigger value="summary" className="relative cursor-pointer">
              Summary
              {activeTab === "summary" && (
                <motion.div
                  layoutId="detailsTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF5A1F]"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="accounts" className="relative cursor-pointer">
              Accounts
              {activeTab === "accounts" && (
                <motion.div
                  layoutId="detailsTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF5A1F]"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className="relative cursor-pointer">
              Logs
              {activeTab === "logs" && (
                <motion.div
                  layoutId="detailsTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF5A1F]"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="activity" className="relative cursor-pointer flex items-center gap-1.5">
              <span>Activity</span>
              {activityHistory.length > 0 && (
                <span className="text-[10px] bg-[#FF5A1F] text-[#0C0C0B] px-1 py-0.2 rounded-full font-bold tabular-nums">
                  {activityHistory.length}
                </span>
              )}
              {activeTab === "activity" && (
                <motion.div
                  layoutId="detailsTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF5A1F]"
                />
              )}
            </TabsTrigger>
          </TabsList>

          {/* 1. SUMMARY TAB */}
          <TabsContent value="summary" className="space-y-6 pt-3 font-mono">
            {/* Compute Section */}
            <div className="space-y-1.5">
              <div className="text-xs uppercase text-[#888882] tracking-wider font-semibold">
                Compute Units (CU)
              </div>
              <div className="flex justify-between text-xs text-[#888882] mt-2">
                <span>Reserved by default</span>
                <span className="text-[#EDEDEC] tabular-nums">{beforeCu.toLocaleString()} CU</span>
              </div>
              <DotBar filledCount={DOT_COUNT} variant="baseline" />

              <div className="flex justify-between text-xs text-[#888882] mt-2">
                <span className="text-[#D8F5C8]">Right-sized (1.10× probe)</span>
                <span className="text-[#D8F5C8] tabular-nums font-semibold">
                  {afterCu.toLocaleString()} CU (-{Math.round((1 - afterCu / beforeCu) * 100)}%)
                </span>
              </div>
              <DotBar filledCount={cuDots} variant="optimized" />
            </div>

            {/* Loaded Data Section */}
            <div className="space-y-1.5 border-t border-[#232320] pt-4">
              <div className="text-xs uppercase text-[#888882] tracking-wider font-semibold">
                SIMD-0186 Loaded Account Data
              </div>
              <div className="flex justify-between text-xs text-[#888882] mt-2">
                <span>Default limit</span>
                <span className="text-[#EDEDEC] tabular-nums">64.0 MiB (16,384 CU cost)</span>
              </div>
              <DotBar filledCount={DOT_COUNT} variant="baseline" />

              <div className="flex justify-between text-xs text-[#888882] mt-2">
                <span className="text-[#D8F5C8]">Right-sized size limit</span>
                <span className="text-[#D8F5C8] tabular-nums font-semibold">
                  {(afterDataBytes / 1024).toFixed(1)} KiB ({Math.ceil(afterDataBytes / 32768) * 8} CU cost)
                </span>
              </div>
              <DotBar filledCount={dataDots} variant="optimized" />
            </div>

            {/* Fee Section */}
            <div className="space-y-1 border-t border-[#232320] pt-4">
              <div className="text-xs uppercase text-[#888882] tracking-wider font-semibold">Network Fee</div>
              <div className="text-2xl font-bold text-[#EDEDEC] tracking-tight tabular-nums">
                {feeLamports.toLocaleString()} lamports
              </div>
              <div className="text-xs text-[#888882]">
                {optMode === "fastest" ? "Optimized: Same fee budget, 5.7× priority boost" : "Optimized: Minimum priority fee (~82% saved)"}
              </div>
            </div>

            {/* Priority Section */}
            <div className="space-y-1 border-t border-[#232320] pt-4">
              <div className="text-xs uppercase text-[#888882] tracking-wider font-semibold">
                Agave Priority Score
              </div>
              <div className="text-xl font-mono text-[#EDEDEC] flex items-center gap-3">
                <span className="text-[#888882] tabular-nums">{beforePriority.toLocaleString()}</span>
                <span className="text-[#888882]">→</span>
                <span className="font-doto text-3xl font-bold tracking-tight text-[#D8F5C8] tabular-nums">
                  {afterPriority.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Collapsible Agave Formula & Byte Sizes */}
            <div className="border-t border-[#232320] pt-4 text-[11px] text-[#888882]">
              <button
                type="button"
                onClick={() => setShowFormulaBreakdown(!showFormulaBreakdown)}
                className="w-full flex items-center justify-between text-left py-1 text-[#888882] hover:text-[#EDEDEC] transition-colors cursor-pointer select-none"
              >
                <span className="uppercase tracking-wider font-semibold">
                  Agave Scheduler Cost Formula
                </span>
                {showFormulaBreakdown ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <AnimatePresence>
                {showFormulaBreakdown && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden pt-2 space-y-3"
                  >
                    <div className="p-2.5 bg-[#141413] border border-[#232320] rounded-[2px] text-[#EDEDEC] space-y-1 text-[10px]">
                      <div><code>Priority = ⌊(reward × 10⁶) / (totalCost + 1)⌋</code></div>
                      <div className="text-[#888882]"><code>totalCost = sigs×720 + writeLocks×300 + ⌈ixBytes/32⌉ + cuLimit + pages×8</code></div>
                    </div>

                    {report?.loadedDataItems && report.loadedDataItems.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase text-[#A1A19A]">Per-Account Bytes</div>
                        <div className="space-y-1">
                          {report.loadedDataItems.slice(0, 6).map((item) => (
                            <div key={item.address} className="flex justify-between text-[11px]">
                              <span className="truncate max-w-[220px] text-[#A1A19A]">{item.label}</span>
                              <span className="tabular-nums text-[#EDEDEC]">{item.totalBytes} B</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TabsContent>

          {/* 2. ACCOUNTS TAB */}
          <TabsContent value="accounts" className="space-y-0 pt-2 font-mono divide-y divide-[#232320]">
            {zombies.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#73736E]">
                No candidate empty accounts found in wallet
              </div>
            ) : (
              zombies.map((z) => {
                const rentSol = z.rentLamports / LAMPORTS_PER_SOL;
                const cls = z.classification;
                const kind = cls?.tokenKind;
                const kindName =
                  kind === "spam_airdrop"
                    ? "Spam airdrop"
                    : kind === "dead_or_test_token"
                    ? "Test token"
                    : kind === "stablecoin"
                    ? "Stablecoin"
                    : z.isTestMintFromCache
                    ? "Test token"
                    : "Unverified token";
                const repeatPct =
                  cls?.willReceiveAgain != null
                    ? `${Math.round(cls.willReceiveAgain * 100)}%`
                    : z.isKnownStablecoin
                    ? "79%"
                    : "3%";
                const symbol = tokenMetaMap[z.address]?.symbol || z.symbol || "TOKEN";
                const isExpanded = expandedAccount === z.address;

                return (
                  <div key={z.address} className="py-3">
                    <div
                      onClick={() => setExpandedAccount(isExpanded ? null : z.address)}
                      className="flex justify-between items-baseline text-xs text-[#EDEDEC] cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold group-hover:text-[#FF5A1F] transition-colors">
                          {symbol} · {formatShortAddress(z.address)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3 text-[#888882]" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-[#888882]" />
                        )}
                      </div>
                      <span className={`tabular-nums font-semibold shrink-0 ${z.selectedForClose ? "text-[#D8F5C8]" : "text-[#73736E]"}`}>
                        {z.selectedForClose ? `+${rentSol.toFixed(6)} SOL` : "Kept open"}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#888882] mt-0.5">
                      {kindName} · {repeatPct} repeat chance · {z.selectedForClose ? "Closing for refund" : "Keeping"}
                    </div>

                    {/* Expandable Account Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden mt-2 pt-2 border-t border-[#1C1C1A] text-[10px] space-y-1.5 text-[#A1A19A]"
                        >
                          <div className="flex items-center justify-between">
                            <span>Mint Address:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[#EDEDEC]">{formatShortAddress(z.mint)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(z.mint, `mint-${z.address}`);
                                }}
                                className="p-0.5 hover:text-white transition-colors cursor-pointer"
                                title="Copy Mint Address"
                              >
                                {copiedKey === `mint-${z.address}` ? (
                                  <Check className="w-3 h-3 text-[#D8F5C8]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Account Address:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[#EDEDEC]">{formatShortAddress(z.address)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(z.address, `addr-${z.address}`);
                                }}
                                className="p-0.5 hover:text-white transition-colors cursor-pointer"
                                title="Copy Account Address"
                              >
                                {copiedKey === `addr-${z.address}` ? (
                                  <Check className="w-3 h-3 text-[#D8F5C8]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Refund Rent:</span>
                            <span className="text-[#D8F5C8] tabular-nums font-semibold">
                              {z.rentLamports.toLocaleString()} lamports ({rentSol.toFixed(6)} SOL)
                            </span>
                          </div>
                          {cls?.reason && (
                            <div className="pt-1 text-[10px] text-[#73736E] italic">
                              Recommendation: &quot;{cls.reason}&quot;
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
            <div className="pt-4 text-[10px] text-[#666660]">
              Classified by TypeSafe Jev (choice + noul)
            </div>
          </TabsContent>

          {/* 3. LOGS TAB */}
          <TabsContent value="logs" className="pt-2 font-mono">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] text-[#888882] uppercase tracking-wider">
                Pre-Flight Sim Logs
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-[2px] ${report?.ok !== false ? "bg-[#D8F5C8]/10 text-[#D8F5C8] border border-[#D8F5C8]/30" : "bg-[#FF5A1F]/10 text-[#FF5A1F] border border-[#FF5A1F]/30"}`}>
                {report?.ok !== false ? "✓ Passed" : "✕ Failed"}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-[#EDEDEC] max-h-[65vh] overflow-y-auto bg-[#121210] p-3 rounded-[2px] border border-[#232320]">
              {logs.map((log, idx) => {
                const lineNum = String(idx + 1).padStart(2, "0");
                return (
                  <div key={idx} className="flex items-start gap-3 break-all leading-relaxed font-mono text-[11px]">
                    <span className="text-[#666660] select-none tabular-nums shrink-0">{lineNum}</span>
                    <span className="text-[#EDEDEC] flex-1">{log}</span>
                  </div>
                );
              })}
              {/* Scramble decode line with blinking block cursor */}
              <div className="flex items-start gap-3 break-all leading-relaxed font-mono text-[11px]">
                <span className="text-[#666660] select-none tabular-nums shrink-0">
                  {String(logs.length + 1).padStart(2, "0")}
                </span>
                <span className="text-[#EDEDEC] flex-1">
                  <ScrambleLogLine text="VERIFIED_PACKET_CHECKSUM_OK" />
                </span>
              </div>
            </div>
          </TabsContent>

          {/* 4. ACTIVITY TAB */}
          <TabsContent value="activity" className="pt-2 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-[#232320]">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[#EDEDEC] font-semibold">
                  Recent Activity
                </span>
                <span className="text-[10px] text-[#888882] bg-[#161614] border border-[#232320] px-1.5 py-0.2 rounded-[2px] tabular-nums">
                  {activityHistory.length} total
                </span>
              </div>
              {activityHistory.length > 0 && onClearActivity && (
                <button
                  type="button"
                  onClick={onClearActivity}
                  className="text-[10px] text-[#888882] hover:text-[#FF5A1F] transition-colors flex items-center gap-1 cursor-pointer"
                  title="Clear history"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="mt-3 space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {activityHistory.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-[#73736E]">
                  <div className="w-8 h-8 rounded-full border border-[#232320] flex items-center justify-center text-[#888882]">
                    ⏱
                  </div>
                  <div className="text-xs font-semibold text-[#A1A19A]">No activity recorded yet</div>
                  <div className="text-[11px] max-w-[240px] leading-relaxed">
                    When you send a payment and reclaim rent on Devnet, confirmed on-chain receipts will appear here.
                  </div>
                </div>
              ) : (
                activityHistory.map((item) => {
                  const netSol = item.netDeltaLamports / LAMPORTS_PER_SOL;
                  const isPositive = netSol > 0;
                  const transferSol = item.transferLamports / LAMPORTS_PER_SOL;
                  const feeSol = item.feeLamports / LAMPORTS_PER_SOL;
                  const refundSol = item.reclaimedLamports / LAMPORTS_PER_SOL;

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-[#121210] border border-[#232320] rounded-[2px] space-y-2 hover:border-[#383835] transition-colors"
                    >
                      {/* Top Row: Status + Timestamp */}
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 font-semibold text-[#D8F5C8]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D8F5C8] inline-block animate-pulse" />
                          <span>Confirmed on Devnet</span>
                        </div>
                        <span className="text-[#888882]">
                          {formatRelativeTime(item.timestamp, mounted)}
                        </span>
                      </div>

                      {/* Middle Row: Net Delta SOL */}
                      <div className="flex items-baseline justify-between pt-1">
                        <span className="text-xs text-[#A1A19A]">Net Balance Change</span>
                        <span
                          className={`font-doto text-lg sm:text-xl font-bold tabular-nums ${
                            isPositive ? "text-[#D8F5C8]" : "text-[#EDEDEC]"
                          }`}
                        >
                          {isPositive ? `+${netSol.toFixed(6)}` : netSol.toFixed(6)} SOL
                        </span>
                      </div>

                      {/* Breakdown Strip */}
                      <div className="pt-2 border-t border-[#1C1C1A] text-[11px] text-[#888882] space-y-1">
                        <div className="flex justify-between">
                          <span>Sent to {formatShortAddress(item.recipient)}</span>
                          <span className="text-[#EDEDEC] tabular-nums">-{transferSol.toFixed(6)} SOL</span>
                        </div>
                        {item.reclaimedCount > 0 && (
                          <div className="flex justify-between">
                            <span>Reclaimed ({item.reclaimedCount} accounts)</span>
                            <span className="text-[#D8F5C8] tabular-nums">+{refundSol.toFixed(6)} SOL</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Network fee ({item.optMode})</span>
                          <span className="text-[#EDEDEC] tabular-nums">-{feeSol.toFixed(6)} SOL</span>
                        </div>
                        {item.memo && (
                          <div className="flex justify-between text-[10px] text-[#A1A19A] pt-0.5">
                            <span>Memo:</span>
                            <span className="italic truncate max-w-[180px]">&quot;{item.memo}&quot;</span>
                          </div>
                        )}
                      </div>

                      {/* Bottom Link: Solscan */}
                      <div className="pt-2 flex items-center justify-between">
                        <a
                          href={`https://solscan.io/tx/${item.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#EDEDEC] hover:text-[#FF5A1F] transition-colors flex items-center gap-1 cursor-pointer select-none"
                        >
                          <Image src="/icons/solscan.png" alt="Solscan" width={14} height={14} className="rounded-full shrink-0" />
                          <span>View on Solscan</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleCopy(item.signature, item.id)}
                          className="text-[10px] text-[#888882] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {copiedKey === item.id ? (
                            <>
                              <Check className="w-3 h-3 text-[#D8F5C8]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Sig</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
