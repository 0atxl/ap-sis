"use client";

import React, { useMemo } from "react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";

interface PaymentFormProps {
  recipient: string;
  onRecipientChange: (addr: string) => void;
  amountSol: number;
  onAmountChange: (amount: number) => void;
  memo: string;
  onMemoChange: (memo: string) => void;
  balanceLamports: number | null;
  connected: boolean;
  walletAddress?: string;
  demoRecipient: string;
}

export function PaymentForm({
  recipient,
  onRecipientChange,
  amountSol,
  onAmountChange,
  memo,
  onMemoChange,
  balanceLamports,
  connected,
  walletAddress,
  demoRecipient,
}: PaymentFormProps) {
  // Inline Base58 validation
  const isValidAddress = useMemo(() => {
    const trimmed = recipient.trim();
    if (!trimmed) return null;
    try {
      new PublicKey(trimmed);
      return true;
    } catch {
      return false;
    }
  }, [recipient]);

  // Clipboard paste handler
  const handlePaste = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          onRecipientChange(text.trim());
          toast.success("Address pasted from clipboard");
        }
      }
    } catch {
      toast.error("Clipboard permission denied. Please paste using keyboard shortcut.");
    }
  };

  // Max balance handler (reserves 0.005 SOL for network fees)
  const handleMax = () => {
    if (balanceLamports !== null && balanceLamports > 0) {
      const reserve = 5_000_000; // 0.005 SOL reserve
      const maxLamports = Math.max(0, balanceLamports - reserve);
      onAmountChange(Number((maxLamports / LAMPORTS_PER_SOL).toFixed(6)));
    } else {
      onAmountChange(0.01);
    }
  };

  return (
    <div className="w-full bg-[#121210] border border-[#232320] rounded-[2px] p-3 sm:p-4 my-3 font-mono shadow-sm">
      <div className="flex flex-col gap-3">
        {/* Field 1: Recipient Address */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#888880] tracking-wider font-mono">
            <span className="uppercase font-semibold">Recipient</span>
            <div className="flex items-center gap-2.5">
              {recipient !== demoRecipient && (
                <button
                  type="button"
                  onClick={() => onRecipientChange(demoRecipient)}
                  className="text-[10px] font-mono text-[#888882] hover:text-[#EDEDEC] cursor-pointer select-none underline underline-offset-2"
                >
                  [Demo]
                </button>
              )}
              {connected && walletAddress && recipient !== walletAddress && (
                <button
                  type="button"
                  onClick={() => onRecipientChange(walletAddress)}
                  className="text-[10px] font-mono text-[#888882] hover:text-[#EDEDEC] cursor-pointer select-none underline underline-offset-2"
                >
                  [Self]
                </button>
              )}
              {isValidAddress === true && (
                <span className="text-[#D8F5C8] flex items-center gap-1 font-semibold animate-in fade-in duration-200">
                  ✓ Valid
                </span>
              )}
              {isValidAddress === false && (
                <span className="text-[#FF5A1F] flex items-center gap-1 font-semibold animate-in fade-in duration-200">
                  Invalid base58 address
                </span>
              )}
            </div>
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={recipient}
              onChange={(e) => onRecipientChange(e.target.value.trim())}
              placeholder="Enter Solana Base58 address..."
              className={`w-full bg-[#0C0C0B] border rounded-[2px] pl-3 pr-20 py-2 text-xs sm:text-sm text-[#EDEDEC] font-mono tracking-tight transition-all focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F]/20 focus:outline-none ${
                isValidAddress === false
                  ? "border-[#FF5A1F]/60"
                  : "border-[#232320]"
              }`}
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-1.5 px-2 py-1 bg-[#1A1A18] hover:bg-[#262622] active:scale-95 border border-[#2E2E2A] hover:border-[#3E3E3A] text-[11px] font-mono text-[#A1A19A] hover:text-[#EDEDEC] rounded-[2px] transition-all cursor-pointer select-none"
              title="Paste from clipboard"
            >
              [Paste]
            </button>
          </div>
        </div>

        {/* Row 2: Amount & Memo Split */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-[#1C1C1A]">
          {/* Field 2: Amount (SOL) */}
          <div className="sm:col-span-5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#888880] tracking-wider font-mono">
              <span className="uppercase font-semibold">Amount</span>
              <div className="flex items-center gap-1">
                {connected && balanceLamports !== null && (
                  <span className="text-[#888880] tabular-nums">
                    {(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-[10px] text-[#FF5A1F] hover:text-[#ff7843] hover:underline cursor-pointer ml-1 select-none font-semibold"
                >
                  [Max]
                </button>
              </div>
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-2.5 flex items-center gap-1.5 pointer-events-none select-none text-[#888882] font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F]" />
                <span className="font-semibold text-[11px] text-[#A1A19A]">
                  SOL
                </span>
              </div>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={amountSol === 0 ? "0" : amountSol || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onAmountChange(val === "" ? 0 : Number.parseFloat(val) || 0);
                }}
                placeholder="0.001"
                className="w-full bg-[#0C0C0B] border border-[#232320] rounded-[2px] pl-14 pr-3 py-2 text-xs sm:text-sm text-[#EDEDEC] font-mono tabular-nums transition-all focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F]/20 focus:outline-none"
              />
            </div>
          </div>

          {/* Field 3: Memo / Reference Note */}
          <div className="sm:col-span-7 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#888880] tracking-wider font-mono">
              <span className="uppercase font-semibold">Memo (Optional)</span>
              <span className="text-[#666660] tabular-nums">
                {memo.length}/100
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                maxLength={100}
                value={memo}
                onChange={(e) => onMemoChange(e.target.value)}
                placeholder="e.g. Invoice #42, Team lunch..."
                className="w-full bg-[#0C0C0B] border border-[#232320] rounded-[2px] px-3 py-2 text-xs sm:text-sm text-[#EDEDEC] font-mono transition-all focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F]/20 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Single Unified Preset Strip */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[#1C1C1A]/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: "0.001 SOL · Invoice", amount: 0.001, memoText: "Invoice #42" },
              { label: "0.01 SOL · Split", amount: 0.01, memoText: "Team Split" },
              { label: "0.05 SOL", amount: 0.05, memoText: memo || "Payment" },
              { label: "Sweep Rent Only (0 SOL)", amount: 0, memoText: "Reclaim Rent Only" },
            ].map((preset) => {
              const active = amountSol === preset.amount;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onAmountChange(preset.amount);
                    onMemoChange(preset.memoText);
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-[2px] border active:scale-95 transition-all cursor-pointer select-none ${
                    active
                      ? "bg-[#FF5A1F]/15 border-[#FF5A1F]/50 text-[#FF5A1F] font-semibold"
                      : "bg-[#161614] hover:bg-[#1E1E1C] border-[#262622] text-[#888882] hover:text-[#EDEDEC]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
