"use client";

import React from "react";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import { ScannedZombieAccount } from "@/lib/zombies";
import { OptimizationMode } from "@/lib/compiler";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

interface AccountLedgerProps {
  recipient: string;
  transferLamports: number;
  feeLamports: number;
  optMode?: OptimizationMode;
  zombies: ScannedZombieAccount[];
  onToggle: (address: string) => void;
  tokenMetaMap: Record<string, { symbol: string; displayName: string }>;
  connected?: boolean;
  onSeedZombies?: () => Promise<void>;
  seedBusy?: boolean;
}

function getTokenIcon(symbol?: string, name?: string): string | null {
  const s = (symbol || "").toUpperCase();
  const n = (name || "").toUpperCase();
  if (s === "USDC" || n.includes("USD COIN")) return "/icons/usdc.png";
  if (s === "USDT" || n.includes("TETHER")) return "/icons/usdt.svg";
  if (s === "BONK") return "/icons/bonk.png";
  if (s === "JUP" || n.includes("JUPITER")) return "/icons/jup.png";
  if (s === "SOL" || n.includes("SOLANA")) return "/icons/sol.png";
  return null;
}

export function AccountLedger({
  recipient,
  transferLamports,
  feeLamports,
  optMode = "cheapest",
  zombies,
  onToggle,
  tokenMetaMap,
  connected = false,
  onSeedZombies,
  seedBusy = false,
}: AccountLedgerProps) {
  const formatShortAddress = (addr: string) => {
    if (!addr) return "";
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const paymentSol = transferLamports / LAMPORTS_PER_SOL;
  const feeSol = feeLamports / LAMPORTS_PER_SOL;

  const getVerdictLabel = (z: ScannedZombieAccount) => {
    const symbol = tokenMetaMap[z.address]?.symbol || z.symbol || "TOKEN";
    const kind = z.classification?.tokenKind;
    const kindLabel =
      kind === "spam_airdrop"
        ? "Spam airdrop"
        : kind === "dead_or_test_token"
        ? "Test token"
        : kind === "stablecoin"
        ? "Stablecoin"
        : z.isTestMintFromCache
        ? "Test token"
        : "Unverified token";

    if (!z.selectedForClose && (kind === "stablecoin" || z.isKnownStablecoin)) {
      return `${symbol} · ${kindLabel} (keep open)`;
    }
    return `${symbol} · ${kindLabel}`;
  };

  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs sm:text-sm text-[#EDEDEC] w-full">
      {/* Payment Line */}
      <div className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413]/50 rounded-[2px] transition-colors">
        <span className="shrink-0 text-[#EDEDEC] flex items-center gap-1.5">
          <Image src="/icons/sol.png" alt="SOL" width={14} height={14} className="rounded-full inline-block" />
          <span>
            {transferLamports > 0
              ? `Payment to ${formatShortAddress(recipient)}`
              : "Rent sweep only (no transfer)"}
          </span>
        </span>
        <span className="flex-1 mx-2 dot-leader min-w-4 h-2 self-center translate-y-[2px]" />
        <span className="tabular-nums text-[#EDEDEC] shrink-0">
          {transferLamports > 0 ? `-${paymentSol.toFixed(6)}` : "0.000000"}
        </span>
      </div>

      {/* Network Fee Line */}
      <div className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413]/50 rounded-[2px] transition-colors">
        <span className="shrink-0 text-[#EDEDEC] flex items-center gap-1.5">
          <span>Network fee</span>
          <span className="text-[10px] text-[#D8F5C8] font-normal border border-[#D8F5C8]/30 px-1 py-0.2 rounded-[2px]">
            {optMode === "fastest" ? "5.7× prio" : "-82% prio"}
          </span>
        </span>
        <span className="flex-1 mx-2 dot-leader min-w-4 h-2 self-center translate-y-[2px]" />
        <span className="tabular-nums text-[#EDEDEC] shrink-0">
          -{feeSol.toFixed(6)}
        </span>
      </div>

      {/* Empty Token Accounts */}
      {zombies.length === 0 ? (
        <div className="flex items-center justify-between py-2 px-2 -mx-2 text-[#73736E] text-xs">
          <span>No empty accounts in wallet</span>
          {connected && onSeedZombies && (
            <button
              type="button"
              onClick={onSeedZombies}
              disabled={seedBusy}
              className="text-xs font-mono text-[#FF5A1F] hover:text-[#ff7843] disabled:opacity-50 transition-colors cursor-pointer underline underline-offset-4"
            >
              {seedBusy ? "Seeding..." : "[+ Seed 3 test accounts]"}
            </button>
          )}
        </div>
      ) : (
        zombies.map((z) => {
          const rentSol = z.rentLamports / LAMPORTS_PER_SOL;
          const isSelected = !!z.selectedForClose;
          const symbol = tokenMetaMap[z.address]?.symbol || z.symbol || "TOKEN";
          const iconSrc = getTokenIcon(symbol, z.name);

          return (
            <div
              key={z.address}
              onClick={() => onToggle(z.address)}
              className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413] rounded-[2px] cursor-pointer select-none group transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 pr-1 pointer-events-none">
                <Checkbox
                  checked={isSelected}
                  className="rounded-[2px] border-[#3E3E3A] bg-transparent data-[state=checked]:bg-[#EDEDEC] data-[state=checked]:text-[#0C0C0B]"
                />
                {iconSrc ? (
                  <Image
                    src={iconSrc}
                    alt={symbol}
                    width={14}
                    height={14}
                    className="rounded-full object-contain shrink-0"
                  />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-[#1C1C1A] border border-[#2E2E2A] flex items-center justify-center text-[8px] font-mono text-[#A1A19A] shrink-0">
                    {symbol.slice(0, 1)}
                  </span>
                )}
                <span
                  className={`truncate transition-colors ${
                    isSelected ? "text-[#EDEDEC]" : "text-[#73736E]"
                  }`}
                >
                  {getVerdictLabel(z)}
                </span>
              </div>
              <span className="flex-1 mx-2 dot-leader min-w-4 h-2 self-center translate-y-[2px]" />
              <span
                className={`tabular-nums shrink-0 font-mono transition-colors ${
                  isSelected ? "text-[#D8F5C8] font-semibold" : "text-[#555550]"
                }`}
              >
                {isSelected ? `+${rentSol.toFixed(6)}` : "—"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
