"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

interface NetNumberProps {
  netLamports: number;
  isCompiling?: boolean;
  error?: string | null;
  receipt?: {
    signature: string;
    preBalanceLamports: number;
    postBalanceLamports: number;
    actualDeltaLamports: number;
  } | null;
  onReset?: () => void;
  onOpenActivity?: () => void;
  solPriceUsd?: number;
}

export function NetNumber({
  netLamports,
  isCompiling = false,
  error = null,
  receipt = null,
  onReset,
  onOpenActivity,
  solPriceUsd = 172.5,
}: NetNumberProps) {
  const netSol = netLamports / LAMPORTS_PER_SOL;

  // Format SOL amount
  const formatNumber = (num: number) => {
    const absVal = Math.abs(num).toFixed(6);
    if (num > 0) return `+${absVal}`;
    if (num < 0) return `-${absVal}`;
    return "0.000000";
  };

  const targetFormatted = formatNumber(netSol);

  // Scramble text animation on balance changes
  const [displayText, setDisplayText] = useState<string>(targetFormatted);
  const prevTargetRef = useRef<string>(targetFormatted);

  useEffect(() => {
    if (isCompiling || error) return;
    if (prevTargetRef.current === targetFormatted) return;
    prevTargetRef.current = targetFormatted;

    const start = performance.now();
    const duration = 280;
    const GLYPHS = "0123456789";
    let frameId: number;

    const update = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1) {
        setDisplayText(targetFormatted);
        return;
      }

      // Progressively resolve digits from left to right
      const resolvedChars = Math.floor(progress * targetFormatted.length);
      let scrambled = "";
      for (let i = 0; i < targetFormatted.length; i++) {
        const char = targetFormatted[i];
        if (i < resolvedChars || char === "." || char === "+" || char === "-") {
          scrambled += char;
        } else {
          scrambled += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }

      setDisplayText(scrambled);
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [targetFormatted, isCompiling, error]);

  const isPositive = netLamports > 0;
  const usdValue = Math.abs(netSol * solPriceUsd).toFixed(2);

  return (
    <div className="flex flex-col justify-start w-full pr-4">
      <div className="text-xs font-mono text-[#888882] mb-2">
        You end up with
      </div>

      <div className="flex items-baseline whitespace-nowrap overflow-visible">
        {error ? (
          <span className="font-doto text-3xl sm:text-5xl lg:text-6xl text-[#888882] font-bold tracking-tight">
            —
          </span>
        ) : isCompiling ? (
          <span className="font-doto text-3xl sm:text-5xl lg:text-6xl text-[#888882] font-bold tracking-tight animate-pulse">
            ------
          </span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span
              className={`font-doto text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight tabular-nums select-all ${
                isPositive ? "text-[#D8F5C8]" : "text-[#EDEDEC]"
              }`}
            >
              {displayText}
            </span>
            <span className="font-mono text-lg sm:text-2xl text-[#888882] font-normal">
              SOL
            </span>
          </div>
        )}
      </div>

      {/* USD Estimate */}
      <div className="mt-2 text-xs font-mono text-[#888882]">
        {error ? (
          <span>—</span>
        ) : isCompiling ? (
          <span>≈ $0.00</span>
        ) : (
          <span>≈ ${usdValue}</span>
        )}
      </div>

      {/* Error state alert */}
      {error && !isCompiling && (
        <div className="mt-4 border-l-2 border-[#FF5A1F] bg-[#FF5A1F]/5 px-3 py-2 text-xs font-mono text-[#FF5A1F]">
          {error}
        </div>
      )}

      {/* Done / Receipt State */}
      {receipt && (
        <div className="mt-5 p-3.5 bg-[#121210] border border-[#232320] rounded-[2px] font-mono text-xs flex flex-col gap-2.5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[#D8F5C8] font-semibold text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D8F5C8] inline-block animate-pulse" />
              <span>Confirmed on Devnet</span>
            </span>
            <span className="text-[10px] text-[#888882]">Saved on-chain</span>
          </div>

          <div className="space-y-1 pt-1 border-t border-[#1C1C1A] text-[11px]">
            <div className="text-[#888882] flex justify-between">
              <span>Before:</span>
              <span className="text-[#EDEDEC] tabular-nums">
                {(receipt.preBalanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL
              </span>
            </div>
            <div className="text-[#888882] flex justify-between">
              <span>After:</span>
              <span className="text-[#D8F5C8] tabular-nums font-semibold">
                {(receipt.postBalanceLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#1C1C1A]">
            <a
              href={`https://solscan.io/tx/${receipt.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-[#EDEDEC] hover:text-[#FF5A1F] transition-colors flex items-center gap-1.5 text-[11px] underline underline-offset-4"
            >
              <Image src="/icons/solscan.png" alt="Solscan" width={14} height={14} className="rounded-full" />
              <span>Solscan</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>

            <div className="flex items-center gap-3">
              {onOpenActivity && (
                <button
                  type="button"
                  onClick={onOpenActivity}
                  className="text-[#FF5A1F] hover:text-[#ff7843] transition-colors underline underline-offset-4 cursor-pointer text-[11px]"
                >
                  View in Activity →
                </button>
              )}
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-[#888882] hover:text-[#EDEDEC] transition-colors underline underline-offset-4 cursor-pointer text-[11px]"
                >
                  Send another
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
