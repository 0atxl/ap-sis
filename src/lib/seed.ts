import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeAccount3Instruction,
  createInitializeMint2Instruction,
} from "@solana/spl-token";

export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280; // 165-byte SPL Token account rent-exempt deposit
export const MINT_ACCOUNT_RENT_LAMPORTS = 1_461_600; // 82-byte SPL Mint rent-exempt deposit

const TEST_MINT_BY_WALLET_PREFIX = "ap-sis:test-mint:";
const TEST_MINTS_SET_KEY = "ap-sis:test-mints";

export function getCachedTestMints(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(TEST_MINTS_SET_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function recordTestMintInCache(
  walletBase58: string,
  mintBase58: string
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${TEST_MINT_BY_WALLET_PREFIX}${walletBase58}`,
      mintBase58
    );
    const existing = getCachedTestMints();
    existing.add(mintBase58);
    window.localStorage.setItem(
      TEST_MINTS_SET_KEY,
      JSON.stringify(Array.from(existing))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function getWalletCachedMint(walletBase58: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(
      `${TEST_MINT_BY_WALLET_PREFIX}${walletBase58}`
    );
  } catch {
    return null;
  }
}

export type WalletSendTxFn = (
  transaction: Transaction,
  connection: Connection,
  options?: { signers?: Keypair[] }
) => Promise<string>;

/**
 * Ensures the connected wallet has a reusable Devnet test mint cached in localStorage
 * and verified on-chain so we don't re-lock 0.00146 SOL of mint rent on every seed run.
 */
export async function ensureTestMint(
  connection: Connection,
  walletPubkey: PublicKey,
  sendTransaction: WalletSendTxFn
): Promise<{ mint: PublicKey; reused: boolean; signature?: string }> {
  const walletStr = walletPubkey.toBase58();
  const cachedMintStr = getWalletCachedMint(walletStr);

  if (cachedMintStr) {
    try {
      const candidate = new PublicKey(cachedMintStr);
      const info = await connection.getAccountInfo(candidate, "confirmed");
      if (info && info.owner.equals(TOKEN_PROGRAM_ID)) {
        recordTestMintInCache(walletStr, candidate.toBase58());
        return { mint: candidate, reused: true };
      }
    } catch {
      // Cached mint invalid or Devnet reset; create a fresh one below
    }
  }

  const mintKeypair = Keypair.generate();
  const mintRent = await connection
    .getMinimumBalanceForRentExemption(MINT_SIZE)
    .catch(() => MINT_ACCOUNT_RENT_LAMPORTS);

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: walletPubkey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: walletPubkey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      6,
      walletPubkey,
      walletPubkey,
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await sendTransaction(tx, connection, {
    signers: [mintKeypair],
  });

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  recordTestMintInCache(walletStr, mintKeypair.publicKey.toBase58());
  return { mint: mintKeypair.publicKey, reused: false, signature };
}

export interface SeedZombieResult {
  signature: string;
  mint: string;
  createdAccounts: string[];
  reusedMint: boolean;
  reclaimableRentLamports: number;
}

/**
 * Seeds `count` empty keypair SPL token accounts (165 bytes, 2,039,280 lamports each, 100% reclaimable)
 * for the wallet's cached test mint in a single atomic transaction.
 * If the wallet doesn't have a cached test mint on-chain yet, initializes it in the same transaction
 * so the user only signs once.
 */
export async function seedZombie(
  connection: Connection,
  walletPubkey: PublicKey,
  sendTransaction: WalletSendTxFn,
  count = 3
): Promise<SeedZombieResult> {
  const safeCount = Math.max(1, Math.min(6, Math.floor(count)));
  const walletStr = walletPubkey.toBase58();
  const cachedMintStr = getWalletCachedMint(walletStr);

  let mintPubkey: PublicKey | null = null;
  let reusedMint = false;

  if (cachedMintStr) {
    try {
      const candidate = new PublicKey(cachedMintStr);
      const info = await connection.getAccountInfo(candidate, "confirmed");
      if (info && info.owner.equals(TOKEN_PROGRAM_ID)) {
        mintPubkey = candidate;
        reusedMint = true;
      }
    } catch {
      mintPubkey = null;
    }
  }

  const signers: Keypair[] = [];
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: walletPubkey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  if (!mintPubkey) {
    const newMintKp = Keypair.generate();
    mintPubkey = newMintKp.publicKey;
    signers.push(newMintKp);

    const mintRent = await connection
      .getMinimumBalanceForRentExemption(MINT_SIZE)
      .catch(() => MINT_ACCOUNT_RENT_LAMPORTS);

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: walletPubkey,
        newAccountPubkey: newMintKp.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        newMintKp.publicKey,
        6,
        walletPubkey,
        walletPubkey,
        TOKEN_PROGRAM_ID
      )
    );
  }

  const acctRent = await connection
    .getMinimumBalanceForRentExemption(ACCOUNT_SIZE)
    .catch(() => TOKEN_ACCOUNT_RENT_LAMPORTS);

  const createdAccounts: string[] = [];

  for (let i = 0; i < safeCount; i++) {
    const acctKp = Keypair.generate();
    signers.push(acctKp);
    createdAccounts.push(acctKp.publicKey.toBase58());

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: walletPubkey,
        newAccountPubkey: acctKp.publicKey,
        space: ACCOUNT_SIZE,
        lamports: acctRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(
        acctKp.publicKey,
        mintPubkey,
        walletPubkey,
        TOKEN_PROGRAM_ID
      )
    );
  }

  const signature = await sendTransaction(tx, connection, { signers });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  recordTestMintInCache(walletStr, mintPubkey.toBase58());

  return {
    signature,
    mint: mintPubkey.toBase58(),
    createdAccounts,
    reusedMint,
    reclaimableRentLamports: acctRent * safeCount,
  };
}
