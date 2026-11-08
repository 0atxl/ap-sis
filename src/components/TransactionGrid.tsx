"use client";

import React, { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export interface ClusterInfo {
  id: string;
  label: string;
  bytes: number;
}

interface TransactionGridProps {
  baseBytes?: number;
  maxBytes?: number;
  clusters?: ClusterInfo[];
  isCompiling?: boolean;
  isSigning?: boolean;
  isDone?: boolean;
}

export function TransactionGrid({
  baseBytes = 284,
  maxBytes = 1232,
  clusters = [],
  isCompiling = false,
  isSigning = false,
  isDone = false,
}: TransactionGridProps) {
  const shouldReduceMotion = useReducedMotion();
  const [cols, setCols] = useState(96);
  const rows = 10;

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 720) {
        setCols(40);
      } else {
        setCols(96);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Base transaction occupies the left-hand columns
  const baseCols = cols === 96 ? 23 : 10;

  // Fixed slot positions for clusters in 96-col mode (up to 8 clusters)
  const clusterWidth = cols === 96 ? 4 : 3;
  const clusterHeight = 3;
  const clusterStartRow = 3;

  const clusterSlots = useMemo(() => {
    if (cols === 40) {
      // 40 columns on mobile
      const start = baseCols + 2;
      const step = 6;
      return [0, 1, 2, 3].map((i) => start + i * step);
    }
    // 96 columns on desktop
    return [33, 51, 69, 79, 86, 26, 42, 60];
  }, [cols, baseCols]);

  const clusterPlacements = useMemo(() => {
    return clusters.slice(0, 8).map((cluster, index) => {
      const startCol = clusterSlots[index] ?? (baseCols + 4 + index * 6);
      return {
        ...cluster,
        colStart: startCol,
        colEnd: startCol + clusterWidth - 1,
        rowStart: clusterStartRow,
        rowEnd: clusterStartRow + clusterHeight - 1,
      };
    });
  }, [clusters, clusterSlots, clusterWidth, baseCols]);

  // Remaining bytes and "room for N more"
  const totalUsedBytes = baseBytes + clusters.length * 38;
  const remainingBytes = Math.max(0, maxBytes - totalUsedBytes);
  const roomForMore = Math.max(0, Math.floor(remainingBytes / 38));

  return (
    <div className="w-full flex flex-col select-none my-3">
      {/* Top Header Labels */}
      <div className="flex items-center justify-between pb-3 text-xs font-mono text-[#888882]">
        <span>Your transaction</span>
        <span>{clusters.length} closed</span>
      </div>

      {/* Grid Canvas / Divs */}
      <div className="relative w-full">
        {/* Shimmer Effect while compiling */}
        {isCompiling && (
          <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        )}

        <div
          className="grid gap-[3px] w-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              // Base transaction cells
              let isBase = false;
              if (c < baseCols - 1) {
                isBase = true;
              } else if (c === baseCols - 1) {
                isBase = r < 7;
              }

              // Cluster cells
              let isCluster = false;
              let clusterObj: (typeof clusterPlacements)[0] | null = null;

              if (!isBase) {
                for (let i = 0; i < clusterPlacements.length; i++) {
                  const cl = clusterPlacements[i];
                  if (
                    c >= cl.colStart &&
                    c <= cl.colEnd &&
                    r >= cl.rowStart &&
                    r <= cl.rowEnd
                  ) {
                    isCluster = true;
                    clusterObj = cl;
                    break;
                  }
                }
              }

              const key = `cell-${r}-${c}`;

              if (isBase) {
                return (
                  <div
                    key={key}
                    className="aspect-square rounded-[1px] bg-[#E5E5E3]"
                  />
                );
              }

              if (isCluster && clusterObj) {
                return (
                  <motion.div
                    key={key}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    animate={
                      isSigning
                        ? { opacity: [0.7, 1, 0.7], scale: [0.95, 1.05, 0.95] }
                        : { opacity: 1, scale: 1 }
                    }
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    transition={
                      isSigning
                        ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" }
                        : { duration: 0.2, ease: "easeOut" }
                    }
                    className={`aspect-square rounded-[1px] transition-colors ${
                      isDone
                        ? "bg-[#D8F5C8] shadow-[0_0_3px_#D8F5C8]"
                        : isSigning
                        ? "bg-[#FF5A1F] shadow-[0_0_3px_#FF5A1F]"
                        : "bg-[#FF5A1F]"
                    }`}
                  />
                );
              }

              return (
                <div
                  key={key}
                  className="aspect-square rounded-[1px] border border-[#232320] bg-transparent"
                />
              );
            })
          )}
        </div>

        {/* Cluster Labels and Room for more indicator */}
        <div className="relative mt-2 h-5 w-full font-mono text-[11px] text-[#888882]">
          <AnimatePresence>
            {clusterPlacements.map((cl) => {
              const centerColPercent =
                ((cl.colStart + cl.colEnd + 1) / 2 / cols) * 100;
              return (
                <motion.div
                  key={cl.id}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute -translate-x-1/2 whitespace-nowrap text-center text-[11px] transition-colors ${
                    isDone
                      ? "text-[#D8F5C8] font-semibold"
                      : isSigning
                      ? "text-[#FF5A1F] font-semibold animate-pulse"
                      : "text-[#888882]"
                  }`}
                  style={{ left: `${centerColPercent}%` }}
                >
                  {cl.label}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {roomForMore > 0 && (
            <div className="absolute right-0 text-right text-[#555550] text-[11px] font-mono">
              room for {roomForMore} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
