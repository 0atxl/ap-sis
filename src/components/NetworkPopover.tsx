"use client";

import React, { useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_DEVNET_RPC } from "@/components/SolanaProvider";
import {
  SOLANA_FAUCET_URL,
  copyWalletAddress,
  isRpcFaucetClosed,
} from "@/lib/faucet";
import { ChevronDown, Loader2 } from "lucide-react";

interface NetworkPopoverProps {
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  resetRpcUrl: () => void;
  onAfterAirdrop?: () => Promise<void>;
  onSeedZombies?: () => Promise<void>;
  seedBusy?: boolean;
  connected?: boolean;
}

export function NetworkPopover({
  rpcUrl,
  setRpcUrl,
  resetRpcUrl,
  onAfterAirdrop,
  onSeedZombies,
  seedBusy,
  connected,
}: NetworkPopoverProps) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [draftRpc, setDraftRpc] = useState(rpcUrl);
  const [airdropBusy, setAirdropBusy] = useState(false);

  const handleAirdrop = async () => {
    if (!publicKey) return;
    setAirdropBusy(true);
    try {
      const sig = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );
      toast.success("Added 1.0 SOL on Devnet");
      await onAfterAirdrop?.();
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Airdrop request failed.";
      if (isRpcFaucetClosed(err)) {
        await copyWalletAddress(publicKey.toBase58());
      }
      toast.error(reason, {
        duration: 12000,
        description:
          "Use Try with demo wallet, or request SOL at faucet.solana.com.",
        action: {
          label: "Open faucet",
          onClick: () => {
            window.open(SOLANA_FAUCET_URL, "_blank", "noopener,noreferrer");
          },
        },
      });
    } finally {
      setAirdropBusy(false);
    }
  };

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
    <Popover
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (val) setDraftRpc(rpcUrl);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs font-sans text-[#A1A19A] hover:text-[#EDEDEC] transition-colors flex items-center gap-1 cursor-pointer select-none outline-none"
        >
          <span>Devnet</span>
          <ChevronDown className="w-3 h-3 text-[#73736E]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 rounded-[2px] bg-[#141413] border border-[#262624] p-4 text-[#EDEDEC] shadow-2xl font-sans text-xs"
      >
        <div className="flex flex-col gap-3">
          <label className="text-xs text-[#A1A19A]">
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
              className="px-3 py-1.5 bg-[#FF5A1F] text-[#0C0C0B] font-medium text-xs rounded-[2px] hover:bg-[#ff713a] transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>

          <div className="border-t border-[#232320] pt-3 mt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  void handleAirdrop();
                }}
                disabled={airdropBusy || !connected}
                className="text-xs text-[#A1A19A] hover:text-[#EDEDEC] disabled:opacity-40 disabled:hover:text-[#A1A19A] transition-colors flex items-center gap-2 cursor-pointer"
              >
                {airdropBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>+1.0 Devnet SOL</span>
              </button>
              {!connected && (
                <span className="text-[11px] text-[#73736E]">Connect wallet first</span>
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
                  className="text-xs text-[#A1A19A] hover:text-[#D8F5C8] disabled:opacity-40 disabled:hover:text-[#A1A19A] transition-colors flex items-center gap-2 cursor-pointer"
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
