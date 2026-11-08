"use client";

import React, { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OptimizationMode } from "@/lib/compiler";

interface SignButtonProps {
  connected: boolean;
  isCompiling: boolean;
  isSigning: boolean;
  hasError: boolean;
  optMode: OptimizationMode;
  onOptModeChange: (mode: OptimizationMode) => void;
  onSign: () => void;
  onConnect: () => void;
  onCancel?: () => void;
  transferLamports?: number;
  reclaimCount?: number;
}

const SPINNER_FRAMES = ["·", ":", "░", "▒", "▓"];

export function SignButton({
  connected,
  isCompiling,
  isSigning,
  hasError,
  optMode,
  onOptModeChange,
  onSign,
  onConnect,
  onCancel,
  transferLamports = 1_000_000,
  reclaimCount = 0,
}: SignButtonProps) {
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    if (!isSigning) return;
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 200);
    return () => clearInterval(interval);
  }, [isSigning]);

  const isDisabled =
    isCompiling ||
    isSigning ||
    (connected && hasError) ||
    (transferLamports === 0 && reclaimCount === 0);

  const getButtonText = () => {
    if (!connected) {
      return "Connect wallet to sign";
    }
    if (isSigning) {
      return `Waiting for your wallet ${SPINNER_FRAMES[spinnerIndex]}`;
    }
    if (isCompiling) {
      return "Compiling";
    }
    if (transferLamports === 0 && reclaimCount > 0) {
      return `Sign and reclaim (${reclaimCount})`;
    }
    if (reclaimCount > 0) {
      return "Sign, send & reclaim";
    }
    return "Sign and send";
  };

  const handleClick = () => {
    if (!connected) {
      onConnect();
    } else {
      onSign();
    }
  };

  const modeHint =
    optMode === "fastest" ? "Same fee, confirms sooner" : "Lowest priority fee";

  return (
    <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 pt-2.5 border-t border-[#232320] font-sans">
      {/* Left: Speed Toggle + Hint */}
      <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-3">
        <ToggleGroup
          type="single"
          value={optMode}
          onValueChange={(val) => {
            if (val === "cheapest" || val === "fastest") {
              onOptModeChange(val);
            }
          }}
          className="border border-[#262624] bg-[#141413] rounded-[2px]"
        >
          <ToggleGroupItem
            value="cheapest"
            className="px-3 py-1.5 text-xs font-sans data-[state=on]:bg-[#262624] data-[state=on]:text-[#EDEDEC] text-[#888882] rounded-[2px]"
          >
            Cheapest
          </ToggleGroupItem>
          <ToggleGroupItem
            value="fastest"
            className="px-3 py-1.5 text-xs font-sans data-[state=on]:bg-[#262624] data-[state=on]:text-[#EDEDEC] text-[#888882] rounded-[2px]"
          >
            Fastest
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs font-sans text-[#888882]">
          {modeHint}
        </span>
      </div>

      {/* Right: Action Button */}
      <div className="w-full sm:flex-1 sm:max-w-md flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          className={`w-full py-2.5 px-6 text-sm font-medium rounded-[2px] transition-all font-sans select-none ${
            isDisabled
              ? "bg-[#262624] text-[#73736E] cursor-not-allowed"
              : "bg-[#FF5A1F] text-[#0C0C0B] hover:bg-[#ff713a] active:translate-y-[1px] cursor-pointer"
          }`}
        >
          {getButtonText()}
        </button>

        {isSigning && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-sans text-[#888882] hover:text-[#EDEDEC] underline underline-offset-4 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
