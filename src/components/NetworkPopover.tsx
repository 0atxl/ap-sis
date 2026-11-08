"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_DEVNET_RPC } from "@/components/SolanaProvider";
import { Loader2 } from "lucide-react";

interface NetworkPopoverProps {
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  resetRpcUrl: () => void;
  onAirdrop?: () => Promise<void>;
  airdropBusy?: boolean;
  onSeedZombies?: () => Promise<void>;
  seedBusy?: boolean;
  connected?: boolean;
}

export function NetworkPopover({
  rpcUrl,
  setRpcUrl,
  resetRpcUrl,
  onAirdrop,
  airdropBusy,
  onSeedZombies,
  seedBusy,
  connected,
}: NetworkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftRpc, setDraftRpc] = useState(rpcUrl);

  const handleApply = () => {
    setRpcUrl(draftRpc);
    setOpen(false);
  };

  const handleReset = () => {
    resetRpcUrl();
    setDraftRpc(DEFAULT_DEVNET_RPC);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(val) => {
      setOpen(val);
      if (val) setDraftRpc(rpcUrl);
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs font-mono text-[#888882] hover:text-[#EDEDEC] transition-colors flex items-center gap-1 cursor-pointer select-none outline-none"
        >
          <span>[Devnet]</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 rounded-[2px] bg-[#141413] border border-[#262624] p-4 text-[#EDEDEC] shadow-2xl font-mono text-xs"
      >
        <div className="flex flex-col gap-3">
          <label className="text-[11px] text-[#888882] uppercase tracking-wider">
            RPC endpoint
          </label>
          <input
            type="text"
            value={draftRpc}
            onChange={(e) => setDraftRpc(e.target.value)}
            className="w-full bg-[#0C0C0B] border border-[#262624] px-3 py-1.5 text-xs text-[#EDEDEC] focus:border-[#FF5A1F] focus:outline-none rounded-[2px] font-mono"
            placeholder={DEFAULT_DEVNET_RPC}
          />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="text-[#888882] hover:text-[#EDEDEC] transition-colors cursor-pointer text-xs underline underline-offset-4"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 bg-[#FF5A1F] text-[#0C0C0B] font-semibold text-xs rounded-[2px] hover:bg-[#ff713a] transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>

          <div className="border-t border-[#232320] pt-3 mt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (onAirdrop) onAirdrop();
                }}
                disabled={airdropBusy || !connected}
                className="text-xs text-[#888882] hover:text-[#EDEDEC] disabled:opacity-40 disabled:hover:text-[#888882] transition-colors flex items-center gap-2 cursor-pointer"
              >
                {airdropBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>+1.0 Devnet SOL</span>
              </button>
              {!connected && (
                <span className="text-[10px] text-[#888882]">Connect wallet first</span>
              )}
            </div>

            {onSeedZombies && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onSeedZombies();
                  }}
                  disabled={seedBusy || !connected}
                  className="text-xs text-[#888882] hover:text-[#D8F5C8] disabled:opacity-40 disabled:hover:text-[#888882] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {seedBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>+ Seed 3 test empty accounts</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
