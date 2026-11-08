import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import type { ZombieCandidateInput } from "@/lib/jev";

export const SPL_MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

export const MAX_PACKET_BYTES = 1232;
export const PROBE_CU_LIMIT = 1_400_000;
export const DEFAULT_UNSCOPED_DATA_LIMIT_BYTES = 64 * 1024 * 1024; // 64 MiB (SIMD-0186 default)
export const DATA_PAGE_SIZE_BYTES = 32_768; // 32 KiB page
export const CU_PER_DATA_PAGE = 8; // 8 CU per 32 KiB page
export const MAX_PACKED_CLOSES = 8;

const BUILTIN_PROGRAMS = new Set<string>([
  SystemProgram.programId.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  "Config1111111111111111111111111111111111111",
  "Stake11111111111111111111111111111111111111",
  "Vote111111111111111111111111111111111111111",
  "AddressLookupTab1e1111111111111111111111111",
  "Ed25519SigVerify111111111111111111111111111",
  "KeccakSecp256k11111111111111111111111111111",
]);

export type OptimizationMode = "cheapest" | "fastest";

export interface BuildPaymentParams {
  from: PublicKey;
  to?: PublicKey;
  lamports: number;
  memo?: string;
}

export interface CostModelBreakdown {
  signaturesCount: number;
  signatureCostCu: number;
  writeLocksCount: number;
  writeLockCostCu: number;
  instructionDataBytes: number;
  instructionDataCostCu: number;
  executionCuLimit: number;
  loadedDataLimitBytes: number;
  loadedDataPages: number;
  loadedDataCostCu: number;
  totalSchedulerCostCu: number;
  baseFeeLamports: number;
  cuPriceMicroLamports: number;
  priorityFeeLamports: number;
  validatorRewardLamports: number;
  priorityScore: number;
}

export interface LoadedDataBreakdownItem {
  address: string;
  label: string;
  dataBytes: number;
  overheadBytes: number;
  totalBytes: number;
}

export interface CompileReport {
  ok: boolean;
  error?: string;
  mode: OptimizationMode;
  // Compute Units
  probeUnitsConsumed: number;
  finalUnitsConsumed: number;
  beforeCuLimit: number;
  afterCuLimit: number;
  // Loaded Accounts Data Size (SIMD-0186)
  computedRawDataBytes: number;
  rpcLoadedAccountsDataSize: number | null;
  beforeDataLimitBytes: number;
  afterDataLimitBytes: number;
  dataLimitOmittedFallback: boolean;
  loadedDataItems: LoadedDataBreakdownItem[];
  // Fees & Priority (Agave cost model)
  rpcMedianCuPriceMicroLamports: number;
  beforeCuPriceMicroLamports: number;
  afterCuPriceMicroLamports: number;
  beforeCost: CostModelBreakdown;
  afterCost: CostModelBreakdown;
  // Packet bytes (1232 B MTU)
  basePacketBytes: number;
  closePackedBytes: number;
  totalPacketBytes: number;
  freePacketBytes: number;
  maxPacketBytes: number;
  // Rent recovery & balance diff
  packedCloses: ZombieCandidateInput[];
  droppedClosesCount: number;
  transferLamports: number;
  baseFeeLamports: number;
  priorityFeeLamports: number;
  totalFeeLamports: number;
  reclaimedRentLamports: number;
  netGasLamports: number; // reclaimedRent - totalFee
  netBalanceChangeLamports: number; // reclaimedRent - totalFee - transfer
  // Logs
  simulationLogs: string[];
  /**
   * True when the connected fee payer has 0 SOL (no on-chain account) and the
   * preview was simulated with a funded fallback address instead.
   */
  isZeroBalanceUnfunded?: boolean;
}

export interface CompileResult {
  tx: Transaction;
  report: CompileReport;
}

/**
 * SIMD-0186 `SetLoadedAccountsDataSizeLimit(u32)` instruction builder.
 * ComputeBudget instruction discriminator = 4, followed by u32 LE byte limit.
 */
export function createSetLoadedAccountsDataSizeLimitInstruction(
  bytes: number
): TransactionInstruction {
  const safeBytes = Math.max(1024, Math.min(0xffffffff, Math.ceil(bytes)));
  const data = Buffer.alloc(5);
  data.writeUInt8(4, 0);
  data.writeUInt32LE(safeBytes, 1);
  return new TransactionInstruction({
    keys: [],
    programId: ComputeBudgetProgram.programId,
    data,
  });
}

/**
 * SIMD-0170 default compute unit limit baseline for a set of instructions:
 * 3,000 CU per builtin instruction + 200,000 CU per non-builtin SBF instruction.
 */
export function calculateDefaultCuLimit(
  instructions: TransactionInstruction[]
): number {
  let total = 0;
  for (const ix of instructions) {
    const pid = ix.programId.toBase58();
    if (BUILTIN_PROGRAMS.has(pid)) {
      total += 3_000;
    } else {
      total += 200_000;
    }
  }
  return Math.min(1_400_000, Math.max(3_000, total));
}

/**
 * Builds the base payment + SPL Memo transaction (before budget & close packing).
 */
export function buildPayment({
  from,
  to,
  lamports,
  memo,
}: BuildPaymentParams): Transaction {
  const tx = new Transaction();
  tx.feePayer = from;

  if (lamports > 0 && to) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports,
      })
    );
  }

  const trimmedMemo = memo?.trim();
  if (trimmedMemo) {
    tx.add(
      new TransactionInstruction({
        keys: [{ pubkey: from, isSigner: true, isWritable: false }],
        programId: SPL_MEMO_PROGRAM_ID,
        data: Buffer.from(trimmedMemo, "utf-8"),
      })
    );
  }

  return tx;
}

/**
 * Measures the wire packet size of a legacy Transaction (capped at 1,232 bytes).
 */
export function measureTransactionBytes(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  recentBlockhash = "11111111111111111111111111111111"
): number {
  const tx = new Transaction({
    feePayer: payer,
    recentBlockhash,
  });
  if (instructions.length > 0) {
    tx.add(...instructions);
  }
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return serialized.length;
}

/**
 * Simulates a legacy instruction set using VersionedTransaction(LegacyMessage)
 * with `sigVerify: false` and `replaceRecentBlockhash: true`.
 */
async function simulateLegacyInstructions(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[]
) {
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions,
  }).compileToLegacyMessage();

  const vtx = new VersionedTransaction(msg);
  const sim = await connection.simulateTransaction(vtx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
  });

  const val = sim.value as {
    err: unknown;
    logs: string[] | null;
    unitsConsumed?: number;
    loadedAccountsDataSize?: number;
  };

  return {
    err: val.err,
    logs: val.logs ?? [],
    unitsConsumed: val.unitsConsumed ?? 0,
    loadedAccountsDataSize:
      typeof val.loadedAccountsDataSize === "number"
        ? val.loadedAccountsDataSize
        : null,
  };
}

/**
 * Computes the Agave scheduler cost and priority score for a transaction.
 * Formula:
 * - signatureCost = numSignatures * 720 CU
 * - writeLockCost = numWriteLocks * 300 CU
 * - instructionDataCost = ceil(instructionDataBytes / 32) CU
 * - loadedDataCost = ceil(dataLimitBytes / 32768) * 8 CU
 * - totalCost = signatureCost + writeLockCost + instructionDataCost + executionCuLimit + loadedDataCost
 * - priorityFee = ceil(cuPriceMicroLamports * executionCuLimit / 1e6)
 * - reward = priorityFee + floor(baseFee / 2)
 * - priorityScore = floor(reward * 1e6 / (totalCost + 1))
 */
export function computeAgaveCostAndPriority(params: {
  payer: PublicKey;
  instructions: TransactionInstruction[];
  executionCuLimit: number;
  loadedDataLimitBytes: number;
  cuPriceMicroLamports: number;
}): CostModelBreakdown {
  const {
    payer,
    instructions,
    executionCuLimit,
    loadedDataLimitBytes,
    cuPriceMicroLamports,
  } = params;

  const signers = new Set<string>([payer.toBase58()]);
  const writableKeys = new Set<string>([payer.toBase58()]);
  let instructionDataBytes = 0;

  for (const ix of instructions) {
    instructionDataBytes += ix.data.length;
    for (const k of ix.keys) {
      const b58 = k.pubkey.toBase58();
      if (k.isSigner) signers.add(b58);
      if (k.isWritable) writableKeys.add(b58);
    }
  }

  const signaturesCount = signers.size;
  const signatureCostCu = signaturesCount * 720;
  const writeLocksCount = writableKeys.size;
  const writeLockCostCu = writeLocksCount * 300;
  const instructionDataCostCu = Math.ceil(instructionDataBytes / 32);
  const loadedDataPages = Math.ceil(
    loadedDataLimitBytes / DATA_PAGE_SIZE_BYTES
  );
  const loadedDataCostCu = loadedDataPages * CU_PER_DATA_PAGE;

  const totalSchedulerCostCu =
    signatureCostCu +
    writeLockCostCu +
    instructionDataCostCu +
    executionCuLimit +
    loadedDataCostCu;

  const baseFeeLamports = signaturesCount * 5_000;
  const priorityFeeLamports = Math.ceil(
    (cuPriceMicroLamports * executionCuLimit) / 1_000_000
  );
  const validatorRewardLamports =
    priorityFeeLamports + Math.floor(baseFeeLamports / 2);

  const priorityScore = Math.floor(
    (validatorRewardLamports * 1_000_000) / (totalSchedulerCostCu + 1)
  );

  return {
    signaturesCount,
    signatureCostCu,
    writeLocksCount,
    writeLockCostCu,
    instructionDataBytes,
    instructionDataCostCu,
    executionCuLimit,
    loadedDataLimitBytes,
    loadedDataPages,
    loadedDataCostCu,
    totalSchedulerCostCu,
    baseFeeLamports,
    cuPriceMicroLamports,
    priorityFeeLamports,
    validatorRewardLamports,
    priorityScore,
  };
}

/**
 * Stage B.2 — Dynamically computes SIMD-0186 loaded account data size from real on-chain accounts:
 * - Sums `data.length + 64` for every unique account key in the transaction
 * - For Upgradeable BPF Loader programs (`BPFLoaderUpgradeab1e11111111111111111111111`),
 *   reads the `programdata` address from bytes `4..36` and adds `programdata.data.length + 64`.
 */
export async function computeLoadedAccountsDataSize(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[]
): Promise<{
  totalRawBytes: number;
  items: LoadedDataBreakdownItem[];
}> {
  const uniqueKeysMap = new Map<string, PublicKey>();
  uniqueKeysMap.set(payer.toBase58(), payer);

  for (const ix of instructions) {
    uniqueKeysMap.set(ix.programId.toBase58(), ix.programId);
    for (const k of ix.keys) {
      uniqueKeysMap.set(k.pubkey.toBase58(), k.pubkey);
    }
  }

  const keysList = Array.from(uniqueKeysMap.values());
  const infos = await connection.getMultipleAccountsInfo(keysList, "confirmed");

  const items: LoadedDataBreakdownItem[] = [];
  const programDataKeysToFetch: { programAddr: string; pdKey: PublicKey }[] =
    [];

  infos.forEach((info, idx) => {
    const pubkey = keysList[idx];
    const addr = pubkey.toBase58();
    const dataBytes = info ? info.data.length : 0;
    const overheadBytes = 64; // SIMD-0186 64-byte per-account header cost
    items.push({
      address: addr,
      label:
        addr === payer.toBase58()
          ? "Fee Payer"
          : addr === SPL_MEMO_PROGRAM_ID.toBase58()
            ? "SPL Memo Program"
            : addr === TOKEN_PROGRAM_ID.toBase58()
              ? "SPL Token Program"
              : addr === TOKEN_2022_PROGRAM_ID.toBase58()
                ? "SPL Token-2022 Program"
                : addr === SystemProgram.programId.toBase58()
                  ? "System Program"
                  : addr === ComputeBudgetProgram.programId.toBase58()
                    ? "ComputeBudget Program"
                    : "Account",
      dataBytes,
      overheadBytes,
      totalBytes: dataBytes + overheadBytes,
    });

    // Check if owned by BPFLoaderUpgradeable (tag === 2 and length >= 36)
    if (
      info &&
      info.owner.equals(BPF_LOADER_UPGRADEABLE_ID) &&
      info.data.length >= 36
    ) {
      const stateTag = info.data.readUInt32LE(0);
      if (stateTag === 2) {
        const pdBytes = info.data.subarray(4, 36);
        const pdKey = new PublicKey(pdBytes);
        programDataKeysToFetch.push({ programAddr: addr, pdKey });
      }
    }
  });

  if (programDataKeysToFetch.length > 0) {
    const pdInfos = await connection.getMultipleAccountsInfo(
      programDataKeysToFetch.map((p) => p.pdKey),
      "confirmed"
    );
    pdInfos.forEach((pdInfo, idx) => {
      if (!pdInfo) return;
      const { programAddr, pdKey } = programDataKeysToFetch[idx];
      const dataBytes = pdInfo.data.length;
      const overheadBytes = 64;
      items.push({
        address: pdKey.toBase58(),
        label: `LoaderV3 ProgramData (${programAddr.slice(0, 6)}…)`,
        dataBytes,
        overheadBytes,
        totalBytes: dataBytes + overheadBytes,
      });
    });
  }

  const totalRawBytes = items.reduce((acc, item) => acc + item.totalBytes, 0);
  return { totalRawBytes, items };
}

export function roundUpTo32KiBPage(bytes: number): number {
  const withMargin = Math.ceil(bytes * 1.1);
  const pages = Math.max(1, Math.ceil(withMargin / DATA_PAGE_SIZE_BYTES));
  return pages * DATA_PAGE_SIZE_BYTES;
}

/**
 * Queries recent prioritization fees for writable accounts in the transaction.
 * Returns both the raw Devnet RPC median of non-zero fees and the effective baseline CU price.
 */
async function fetchBaselineCuPriceMicroLamports(
  connection: Connection,
  writableKeys: PublicKey[]
): Promise<{ rpcMedian: number; effectiveBaseCuPrice: number }> {
  try {
    const recent = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: writableKeys.slice(0, 64),
    });
    const nonZero = recent
      .map((r) => r.prioritizationFee)
      .filter((f) => f > 0)
      .sort((a, b) => a - b);

    if (nonZero.length > 0) {
      const mid = Math.floor(nonZero.length / 2);
      const median =
        nonZero.length % 2 === 0
          ? Math.round((nonZero[mid - 1] + nonZero[mid]) / 2)
          : nonZero[mid];
      // Ensure at least 10,000 micro-lamports so priority fee lamport math has non-zero precision across CU reductions
      return {
        rpcMedian: median,
        effectiveBaseCuPrice: Math.max(10_000, median),
      };
    }
  } catch {
    // Fallback if RPC doesn't support getRecentPrioritizationFees
  }
  // On idle Devnet (0 reported), floor to 10,000 micro-lamports (0.01 lamports/CU) so
  // 203,000 CU -> 2,030 lamports priority fee and Cheapest vs Fastest math doesn't collapse to 1 lamport ceiling.
  return { rpcMedian: 1, effectiveBaseCuPrice: 10_000 };
}

export function isAccountNotFoundSimulationError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === "string") return err.includes("AccountNotFound");
  try {
    return JSON.stringify(err).includes("AccountNotFound");
  } catch {
    return false;
  }
}

function withFeePayer(
  tx: Transaction,
  from: PublicKey,
  to: PublicKey
): Transaction {
  const next = new Transaction();
  next.feePayer = to;
  for (const ix of tx.instructions) {
    next.add(
      new TransactionInstruction({
        programId: ix.programId,
        data: ix.data,
        keys: ix.keys.map((meta) =>
          meta.pubkey.equals(from)
            ? {
                pubkey: to,
                isSigner: meta.isSigner,
                isWritable: meta.isWritable,
              }
            : meta
        ),
      })
    );
  }
  return next;
}

/**
 * A brand-new keypair has no account, so `getBalance` is 0 and simulation
 * returns `AccountNotFound`. Treat both as "not funded yet".
 */
async function payerIsUnfunded(
  connection: Connection,
  payer: PublicKey
): Promise<boolean> {
  try {
    const balance = await connection.getBalance(payer, "confirmed");
    if (balance === 0) return true;
    return false;
  } catch (err) {
    return isAccountNotFoundSimulationError(err);
  }
}

/**
 * Full 3-stage `ap-sis` transaction compiler:
 * - Stage A: Pre-Flight Simulation with 1,400,000 CU probe
 * - Stage B: Budget Right-Sizing (CU limit = ceil(units * 1.10), SIMD-0186 data limit, Cheapest vs Fastest priority math)
 * - Stage C: Spare-byte `CloseAccount` packing (<= 1,232 bytes, max 8 accounts) + verification re-simulation
 */
export async function compile(
  connection: Connection,
  baseTx: Transaction,
  options: {
    mode: OptimizationMode;
    closeCandidates: ZombieCandidateInput[];
    transferLamports: number;
    /** Funded account used only for preview when `payer` has never been airdropped. */
    fallbackPayer?: PublicKey;
  }
): Promise<CompileResult> {
  const payer = baseTx.feePayer;
  if (!payer) {
    throw new Error("Transaction requires a feePayer public key.");
  }

  const { mode, closeCandidates, transferLamports, fallbackPayer } = options;

  if (fallbackPayer && !fallbackPayer.equals(payer)) {
    const unfunded = await payerIsUnfunded(connection, payer);
    if (unfunded) {
      const preview = await compile(
        connection,
        withFeePayer(baseTx, payer, fallbackPayer),
        {
          mode,
          closeCandidates,
          transferLamports,
        }
      );
      preview.report.isZeroBalanceUnfunded = true;
      if (
        !preview.report.ok &&
        isAccountNotFoundSimulationError(preview.report.error)
      ) {
        preview.report.ok = true;
        preview.report.error = undefined;
      }
      return preview;
    }
  }

  const baseInstructions = [...baseTx.instructions];

  // Stage A — Pre-Flight Simulation (1,400,000 CU probe on the base payment)
  const probeInstructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: PROBE_CU_LIMIT }),
    ...baseInstructions,
  ];

  const stageASim = await simulateLegacyInstructions(
    connection,
    payer,
    probeInstructions
  );

  // Compute baseline unoptimized metrics (what a naive wallet sends without pre-flight compilation)
  const beforeCuLimit = calculateDefaultCuLimit(baseInstructions);
  const beforeDataLimitBytes = DEFAULT_UNSCOPED_DATA_LIMIT_BYTES;

  const writableKeysSet = new Map<string, PublicKey>([
    [payer.toBase58(), payer],
  ]);
  for (const ix of baseInstructions) {
    for (const k of ix.keys) {
      if (k.isWritable) writableKeysSet.set(k.pubkey.toBase58(), k.pubkey);
    }
  }

  const { rpcMedian, effectiveBaseCuPrice } =
    await fetchBaselineCuPriceMicroLamports(
      connection,
      Array.from(writableKeysSet.values())
    );

  const beforeCost = computeAgaveCostAndPriority({
    payer,
    instructions: baseInstructions,
    executionCuLimit: beforeCuLimit,
    loadedDataLimitBytes: beforeDataLimitBytes,
    cuPriceMicroLamports: effectiveBaseCuPrice,
  });

  // Fee payer was created between the balance check and this sim, or the RPC
  // reported a non-zero balance for an account that does not exist.
  if (
    stageASim.err &&
    isAccountNotFoundSimulationError(stageASim.err) &&
    fallbackPayer &&
    !fallbackPayer.equals(payer)
  ) {
    const preview = await compile(
      connection,
      withFeePayer(baseTx, payer, fallbackPayer),
      {
        mode,
        closeCandidates,
        transferLamports,
      }
    );
    preview.report.isZeroBalanceUnfunded = true;
    if (
      !preview.report.ok &&
      isAccountNotFoundSimulationError(preview.report.error)
    ) {
      preview.report.ok = true;
      preview.report.error = undefined;
    }
    return preview;
  }

  // If Stage A simulation failed, stop immediately and never let the user sign a failing transaction
  if (stageASim.err) {
    const baseBytes = measureTransactionBytes(payer, baseInstructions);
    return {
      tx: baseTx,
      report: {
        ok: false,
        error: `Pre-flight simulation failed: ${JSON.stringify(stageASim.err)}`,
        mode,
        probeUnitsConsumed: stageASim.unitsConsumed,
        finalUnitsConsumed: stageASim.unitsConsumed,
        beforeCuLimit,
        afterCuLimit: beforeCuLimit,
        computedRawDataBytes: 0,
        rpcLoadedAccountsDataSize: stageASim.loadedAccountsDataSize,
        beforeDataLimitBytes,
        afterDataLimitBytes: beforeDataLimitBytes,
        dataLimitOmittedFallback: false,
        loadedDataItems: [],
        rpcMedianCuPriceMicroLamports: rpcMedian,
        beforeCuPriceMicroLamports: effectiveBaseCuPrice,
        afterCuPriceMicroLamports: effectiveBaseCuPrice,
        beforeCost,
        afterCost: beforeCost,
        basePacketBytes: baseBytes,
        closePackedBytes: 0,
        totalPacketBytes: baseBytes,
        freePacketBytes: Math.max(0, MAX_PACKET_BYTES - baseBytes),
        maxPacketBytes: MAX_PACKET_BYTES,
        packedCloses: [],
        droppedClosesCount: 0,
        transferLamports,
        baseFeeLamports: beforeCost.baseFeeLamports,
        priorityFeeLamports: beforeCost.priorityFeeLamports,
        totalFeeLamports:
          beforeCost.baseFeeLamports + beforeCost.priorityFeeLamports,
        reclaimedRentLamports: 0,
        netGasLamports: -(
          beforeCost.baseFeeLamports + beforeCost.priorityFeeLamports
        ),
        netBalanceChangeLamports: -(
          transferLamports +
          beforeCost.baseFeeLamports +
          beforeCost.priorityFeeLamports
        ),
        simulationLogs: stageASim.logs,
      },
    };
  }

  // Stage C.3 — Pack eligible CloseAccount instructions into spare packet bytes (<= 1,232 bytes, cap at 8)
  const placeholderBudgetIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: effectiveBaseCuPrice,
    }),
    createSetLoadedAccountsDataSizeLimitInstruction(65_536),
  ];

  const baseWithBudgetBytes = measureTransactionBytes(payer, [
    ...placeholderBudgetIxs,
    ...baseInstructions,
  ]);

  const packedCloses: ZombieCandidateInput[] = [];
  const packedCloseIxs: TransactionInstruction[] = [];

  for (const candidate of closeCandidates.slice(0, MAX_PACKED_CLOSES)) {
    let acctPubkey: PublicKey;
    try {
      acctPubkey = new PublicKey(candidate.address);
    } catch {
      continue;
    }
    const programId =
      candidate.programId === TOKEN_2022_PROGRAM_ID.toBase58()
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

    const closeIx = createCloseAccountInstruction(
      acctPubkey,
      payer,
      payer,
      [],
      programId
    );

    const candidateIxs = [
      ...placeholderBudgetIxs,
      ...baseInstructions,
      ...packedCloseIxs,
      closeIx,
    ];
    const candidateBytes = measureTransactionBytes(payer, candidateIxs);

    if (candidateBytes <= MAX_PACKET_BYTES) {
      packedCloses.push(candidate);
      packedCloseIxs.push(closeIx);
    } else {
      break;
    }
  }

  // Stage C.4 & Stage B — Verify packed closes via simulation; if any close fails, drop one by one until it passes
  let droppedClosesCount = 0;
  const workingCloses = [...packedCloses];
  const workingCloseIxs = [...packedCloseIxs];
  let probePackedSim = stageASim;

  while (true) {
    const testIxs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: PROBE_CU_LIMIT }),
      ...baseInstructions,
      ...workingCloseIxs,
    ];
    const simRes = await simulateLegacyInstructions(connection, payer, testIxs);
    if (!simRes.err) {
      probePackedSim = simRes;
      break;
    }
    if (workingCloses.length === 0) {
      probePackedSim = simRes;
      break;
    }
    // Drop the last packed close instruction and retry
    workingCloses.pop();
    workingCloseIxs.pop();
    droppedClosesCount += 1;
  }

  // Stage B.1 — Right-size Compute Unit limit: ceil(unitsConsumed * 1.10)
  // Include ~450 CU headroom for the extra ComputeBudget instructions (SetComputeUnitPrice + SetLoadedAccountsDataSizeLimit)
  const rawUnits = Math.max(1_000, probePackedSim.unitsConsumed + 450);
  const afterCuLimit = Math.ceil(rawUnits * 1.1);

  // Stage B.2 — Compute SIMD-0186 Loaded Accounts Data Size limit from real account & LoaderV3 programdata sizes
  const allPayloadIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: afterCuLimit }),
    ...baseInstructions,
    ...workingCloseIxs,
  ];
  const { totalRawBytes, items: loadedDataItems } =
    await computeLoadedAccountsDataSize(connection, payer, allPayloadIxs);

  const effectiveMeasuredDataBytes = Math.max(
    totalRawBytes,
    probePackedSim.loadedAccountsDataSize ?? 0
  );
  const afterDataLimitBytes = roundUpTo32KiBPage(effectiveMeasuredDataBytes);

  // Stage B.3 — Honest Priority Mode Math (Cheapest vs Fastest)
  // Cheapest: keep baseline CU price -> fee drops proportionally to CU limit
  // Fastest: keep original priority fee lamport budget -> raise CU price = floor(budget * 1e6 / afterCuLimit)
  let afterCuPriceMicroLamports = effectiveBaseCuPrice;
  if (mode === "fastest") {
    const originalFeeBudgetLamports = Math.max(
      1,
      beforeCost.priorityFeeLamports
    );
    afterCuPriceMicroLamports = Math.max(
      effectiveBaseCuPrice,
      Math.floor((originalFeeBudgetLamports * 1_000_000) / afterCuLimit)
    );
  }

  // Assemble final instructions and run final verification re-simulation
  let dataLimitOmittedFallback = false;
  let finalInstructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: afterCuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: afterCuPriceMicroLamports,
    }),
    createSetLoadedAccountsDataSizeLimitInstruction(afterDataLimitBytes),
    ...baseInstructions,
    ...workingCloseIxs,
  ];

  let finalSim = await simulateLegacyInstructions(
    connection,
    payer,
    finalInstructions
  );

  // Risk mitigation (§6): on MaxLoadedAccountsDataSizeExceeded, fall back to omitting SetLoadedAccountsDataSizeLimit
  if (
    finalSim.err &&
    JSON.stringify(finalSim.err).includes("MaxLoadedAccountsDataSizeExceeded")
  ) {
    dataLimitOmittedFallback = true;
    finalInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: afterCuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: afterCuPriceMicroLamports,
      }),
      ...baseInstructions,
      ...workingCloseIxs,
    ];
    finalSim = await simulateLegacyInstructions(
      connection,
      payer,
      finalInstructions
    );
  }

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const finalTx = new Transaction({
    feePayer: payer,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  finalTx.add(...finalInstructions);

  const totalPacketBytes = measureTransactionBytes(
    payer,
    finalInstructions,
    latestBlockhash.blockhash
  );
  const closePackedBytes = Math.max(0, totalPacketBytes - baseWithBudgetBytes);
  const freePacketBytes = Math.max(0, MAX_PACKET_BYTES - totalPacketBytes);

  const afterCost = computeAgaveCostAndPriority({
    payer,
    instructions: finalInstructions,
    executionCuLimit: afterCuLimit,
    loadedDataLimitBytes: dataLimitOmittedFallback
      ? DEFAULT_UNSCOPED_DATA_LIMIT_BYTES
      : afterDataLimitBytes,
    cuPriceMicroLamports: afterCuPriceMicroLamports,
  });

  const reclaimedRentLamports = workingCloses.reduce(
    (sum, c) => sum + c.rentLamports,
    0
  );
  const totalFeeLamports =
    afterCost.baseFeeLamports + afterCost.priorityFeeLamports;
  const netGasLamports = reclaimedRentLamports - totalFeeLamports;
  const netBalanceChangeLamports =
    reclaimedRentLamports - totalFeeLamports - transferLamports;

  return {
    tx: finalTx,
    report: {
      ok: !finalSim.err,
      error: finalSim.err
        ? `Verification simulation failed: ${JSON.stringify(finalSim.err)}`
        : undefined,
      mode,
      probeUnitsConsumed: stageASim.unitsConsumed,
      finalUnitsConsumed: finalSim.unitsConsumed || probePackedSim.unitsConsumed,
      beforeCuLimit,
      afterCuLimit,
      computedRawDataBytes: totalRawBytes,
      rpcLoadedAccountsDataSize:
        finalSim.loadedAccountsDataSize ??
        probePackedSim.loadedAccountsDataSize,
      beforeDataLimitBytes,
      afterDataLimitBytes: dataLimitOmittedFallback
        ? DEFAULT_UNSCOPED_DATA_LIMIT_BYTES
        : afterDataLimitBytes,
      dataLimitOmittedFallback,
      loadedDataItems,
      rpcMedianCuPriceMicroLamports: rpcMedian,
      beforeCuPriceMicroLamports: effectiveBaseCuPrice,
      afterCuPriceMicroLamports,
      beforeCost,
      afterCost,
      basePacketBytes: baseWithBudgetBytes,
      closePackedBytes,
      totalPacketBytes,
      freePacketBytes,
      maxPacketBytes: MAX_PACKET_BYTES,
      packedCloses: workingCloses,
      droppedClosesCount,
      transferLamports,
      baseFeeLamports: afterCost.baseFeeLamports,
      priorityFeeLamports: afterCost.priorityFeeLamports,
      totalFeeLamports,
      reclaimedRentLamports,
      netGasLamports,
      netBalanceChangeLamports,
      simulationLogs: finalSim.logs,
    },
  };
}
