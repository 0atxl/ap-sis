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

  const handleMax = () => {
    if (balanceLamports !== null && balanceLamports > 0) {
      const reserve = 5_000_000;
      const maxLamports = Math.max(0, balanceLamports - reserve);
      onAmountChange(Number((maxLamports / LAMPORTS_PER_SOL).toFixed(6)));
    } else {
      onAmountChange(0.01);
    }
  };

  return (
    <div className="w-full py-2.5 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-start">
        {/* Field 1: Recipient (widest) */}
        <div className="md:col-span-6 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-[#A1A19A]">
            <span>Recipient</span>
            <div className="flex items-center gap-2.5">
              {recipient !== demoRecipient && (
                <button
                  type="button"
                  onClick={() => onRecipientChange(demoRecipient)}
                  className="text-xs text-[#888882] hover:text-[#EDEDEC] cursor-pointer select-none"
                >
                  Sample
                </button>
              )}
              {connected && walletAddress && recipient !== walletAddress && (
                <button
                  type="button"
                  onClick={() => onRecipientChange(walletAddress)}
                  className="text-xs text-[#888882] hover:text-[#EDEDEC] cursor-pointer select-none"
                >
                  Self
                </button>
              )}
              {isValidAddress === false && (
                <span className="text-[#FF5A1F] text-xs">
                  Invalid address
                </span>
              )}
            </div>
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={recipient}
              onChange={(e) => onRecipientChange(e.target.value.trim())}
              placeholder="Solana address"
              className={`w-full bg-[#121210] border rounded-[2px] pl-3 pr-14 py-1.5 text-xs sm:text-sm text-[#EDEDEC] font-mono tracking-tight transition-colors focus:border-[#FF5A1F] focus:outline-none ${
                isValidAddress === false
                  ? "border-[#FF5A1F]/70"
                  : "border-[#232320]"
              }`}
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-2.5 text-xs font-sans text-[#888882] hover:text-[#EDEDEC] transition-colors cursor-pointer select-none"
            >
              Paste
            </button>
          </div>
        </div>

        {/* Field 2: Amount */}
        <div className="md:col-span-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-[#A1A19A]">
            <span>Amount</span>
            {connected && balanceLamports !== null && (
              <span className="font-mono text-[11px] text-[#73736E] tabular-nums">
                {(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
              </span>
            )}
          </div>

          <div className="relative flex items-center">
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
              className="w-full bg-[#121210] border border-[#232320] rounded-[2px] pl-3 pr-16 py-1.5 text-xs sm:text-sm text-[#EDEDEC] font-mono tabular-nums transition-colors focus:border-[#FF5A1F] focus:outline-none"
            />
            <div className="absolute right-2.5 flex items-center gap-2 select-none">
              <span className="font-mono text-xs text-[#73736E]">SOL</span>
              <button
                type="button"
                onClick={handleMax}
                className="text-xs font-sans text-[#888882] hover:text-[#EDEDEC] transition-colors cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>
        </div>

        {/* Field 3: Memo */}
        <div className="md:col-span-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-[#A1A19A]">
            <span>Memo</span>
            {memo.length >= 85 && (
              <span className="font-mono text-[11px] text-[#888882] tabular-nums">
                {memo.length}/100
              </span>
            )}
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              maxLength={100}
              value={memo}
              onChange={(e) => onMemoChange(e.target.value)}
              placeholder="Memo"
              className="w-full bg-[#121210] border border-[#232320] rounded-[2px] px-3 py-1.5 text-xs sm:text-sm text-[#EDEDEC] font-sans transition-colors focus:border-[#FF5A1F] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Single quiet action link */}
      <div className="flex items-center gap-3 pt-1.5">
        <button
          type="button"
          onClick={() => {
            if (amountSol === 0) {
              onAmountChange(0.001);
              if (!memo) onMemoChange("Invoice #42");
            } else {
              onAmountChange(0);
            }
          }}
          className="text-xs font-sans text-[#888882] hover:text-[#EDEDEC] underline underline-offset-4 transition-colors cursor-pointer select-none"
        >
          {amountSol === 0 ? "Restore payment amount (0.001 SOL)" : "Clean up only"}
        </button>
      </div>
    </div>
  );
}
