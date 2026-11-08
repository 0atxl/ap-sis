"use client";

import React from "react";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import { ScannedZombieAccount } from "@/lib/zombies";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

interface AccountLedgerProps {
  recipient: string;
  transferLamports: number;
  feeLamports: number;
  zombies: ScannedZombieAccount[];
  onToggle: (address: string) => void;
  tokenMetaMap: Record<string, { symbol: string; displayName: string }>;
  connected?: boolean;
  preview?: boolean;
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
  zombies,
  onToggle,
  tokenMetaMap,
  connected = false,
  preview = false,
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
    <div className="flex flex-col gap-1 font-sans text-xs sm:text-sm text-[#EDEDEC] w-full">
      {/* Payment Line */}
      <div className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413]/50 rounded-[2px] transition-colors">
        <span className="shrink-0 text-[#EDEDEC] flex items-center gap-1.5">
          <Image src="/icons/sol.png" alt="SOL" width={14} height={14} className="rounded-full inline-block" />
          <span>
            Sent to{" "}
            <span className="font-mono text-[#A1A19A]">
              {formatShortAddress(recipient)}
            </span>
          </span>
        </span>
        <span className="flex-1 mx-3 h-[1px] dot-leader self-center opacity-40" />
        <span className="shrink-0 font-mono tabular-nums text-[#EDEDEC]">
          -{paymentSol.toFixed(6)} SOL
        </span>
      </div>

      {/* Network Fee Line */}
      <div className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413]/50 rounded-[2px] transition-colors">
        <span className="shrink-0 text-[#A1A19A]">
          Network fee
        </span>
        <span className="flex-1 mx-3 h-[1px] dot-leader self-center opacity-40" />
        <span className="shrink-0 font-mono tabular-nums text-[#A1A19A]">
          -{feeSol.toFixed(6)} SOL
        </span>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between pt-3 pb-1">
        <span className="text-xs text-[#888882]">
          Empty accounts to close {(!connected || preview) && "(sample)"}
        </span>
        {connected && zombies.length === 0 && onSeedZombies && (
          <button
            type="button"
            onClick={onSeedZombies}
            disabled={seedBusy}
            className="text-xs text-[#FF5A1F] hover:text-[#ff7843] disabled:opacity-50 transition-colors cursor-pointer underline underline-offset-4"
          >
            {seedBusy ? "Seeding..." : "+ Seed 3 test accounts"}
          </button>
        )}
      </div>

      {/* Zombie Account Rows */}
      {zombies.length === 0 ? (
        <div className="py-4 text-xs text-[#73736E]">
          No empty token accounts found in this wallet.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {zombies.map((z) => {
            const rentSol = z.rentLamports / LAMPORTS_PER_SOL;
            const iconPath = getTokenIcon(z.symbol, z.name);
            const checked = z.selectedForClose;

            return (
              <label
                key={z.address}
                className="flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-[#141413] rounded-[2px] transition-colors cursor-pointer select-none group"
              >
                <div className="flex items-center gap-2.5 min-w-0 shrink">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(z.address)}
                  />
                  {iconPath ? (
                    <Image
                      src={iconPath}
                      alt={z.symbol || "token"}
                      width={16}
                      height={16}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-[#232320] text-[9px] font-mono flex items-center justify-center text-[#A1A19A] shrink-0">
                      {(z.symbol || "T").slice(0, 1)}
                    </span>
                  )}
                  <span
                    className={`truncate ${
                      checked ? "text-[#EDEDEC]" : "text-[#73736E]"
                    }`}
                  >
                    {getVerdictLabel(z)}
                  </span>
                </div>

                <span className="flex-1 mx-3 h-[1px] dot-leader self-center opacity-30 min-w-[16px]" />

                <span
                  className={`shrink-0 font-mono tabular-nums ${
                    checked ? "text-[#D8F5C8]" : "text-[#73736E]"
                  }`}
                >
                  {checked ? `+${rentSol.toFixed(6)} SOL` : "0.000000 SOL"}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
