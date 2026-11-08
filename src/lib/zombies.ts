import { Connection, PublicKey } from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import {
  KNOWN_STABLECOIN_MINTS,
  type ZombieCandidateInput,
  type ZombieClassification,
} from "@/lib/jev";
import { getCachedTestMints, TOKEN_ACCOUNT_RENT_LAMPORTS } from "@/lib/seed";

export interface ScannedZombieAccount extends ZombieCandidateInput {
  classification?: ZombieClassification;
  selectedForClose: boolean;
}

interface ParsedTokenAccountInfo {
  mint?: string;
  owner?: string;
  isNative?: boolean;
  state?: string;
  closeAuthority?: string;
  tokenAmount?: {
    amount?: string;
    decimals?: number;
    uiAmount?: number | null;
  };
  extensions?: Array<{
    extension?: string;
    state?: Record<string, unknown>;
  }>;
}

function hasWithheldTransferFees(
  extensions?: ParsedTokenAccountInfo["extensions"]
): boolean {
  if (!Array.isArray(extensions)) return false;
  for (const ext of extensions) {
    if (ext?.extension === "transferFeeAmount" && ext.state) {
      const withheld = String(ext.state.withheldAmount ?? "0");
      if (withheld !== "0") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Stage C.1 — Scan connected wallet for 0-balance SPL Token & Token-2022 accounts
 * that are safe candidates for `CloseAccount` rent recovery.
 */
export async function scanZombies(
  connection: Connection,
  owner: PublicKey
): Promise<ZombieCandidateInput[]> {
  const ownerBase58 = owner.toBase58();
  const nativeMintBase58 = NATIVE_MINT.toBase58();
  const cachedTestMints = getCachedTestMints();

  const [splTokenResp, token2022Resp] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      "confirmed"
    ),
    connection
      .getParsedTokenAccountsByOwner(
        owner,
        { programId: TOKEN_2022_PROGRAM_ID },
        "confirmed"
      )
      .catch(() => ({ value: [] })),
  ]);

  const rawAccounts = [
    ...splTokenResp.value.map((item) => ({
      ...item,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    })),
    ...token2022Resp.value.map((item) => ({
      ...item,
      programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    })),
  ];

  const candidates: ZombieCandidateInput[] = [];

  for (const entry of rawAccounts) {
    const parsedData = entry.account.data;
    if (!("parsed" in parsedData)) continue;

    const info = parsedData.parsed?.info as ParsedTokenAccountInfo | undefined;
    if (!info || !info.mint) continue;

    // Must be zero balance
    if (info.tokenAmount?.amount !== "0") continue;

    // Skip native wSOL
    if (info.isNative || info.mint === nativeMintBase58) continue;

    // Skip frozen accounts
    if (info.state === "frozen") continue;

    // Close authority must be unset or equal to owner
    if (info.closeAuthority && info.closeAuthority !== ownerBase58) continue;

    // For Token-2022, skip accounts with non-zero withheld transfer fees
    if (
      entry.programId === TOKEN_2022_PROGRAM_ID.toBase58() &&
      hasWithheldTransferFees(info.extensions)
    ) {
      continue;
    }

    const isTestMintFromCache = cachedTestMints.has(info.mint);
    const isKnownStablecoin = KNOWN_STABLECOIN_MINTS.has(info.mint);

    candidates.push({
      address: entry.pubkey.toBase58(),
      mint: info.mint,
      name: isTestMintFromCache
        ? "ap-sis Disposable Devnet Test Mint"
        : isKnownStablecoin
          ? "USD Stablecoin"
          : undefined,
      symbol: isTestMintFromCache
        ? "ZOMBIE-TEST"
        : isKnownStablecoin
          ? "USDC"
          : undefined,
      decimals: info.tokenAmount?.decimals ?? 6,
      supply: isTestMintFromCache ? "0" : undefined,
      recentSignaturesCount: 1,
      isKnownStablecoin,
      isTestMintFromCache,
      programId: entry.programId,
      rentLamports: entry.account.lamports || TOKEN_ACCOUNT_RENT_LAMPORTS,
    });
  }

  // Enrich mint supply from on-chain mint accounts in a single batched RPC call
  const uniqueMintKeys = Array.from(new Set(candidates.map((c) => c.mint)));
  if (uniqueMintKeys.length > 0) {
    try {
      const mintPubkeys = uniqueMintKeys.map((m) => new PublicKey(m));
      const mintInfos = await connection.getMultipleAccountsInfo(
        mintPubkeys,
        "confirmed"
      );
      const supplyByMint = new Map<string, string>();

      mintInfos.forEach((acctInfo, idx) => {
        if (!acctInfo) return;
        const mintAddr = uniqueMintKeys[idx];
        try {
          const unpacked = unpackMint(
            mintPubkeys[idx],
            acctInfo,
            acctInfo.owner
          );
          supplyByMint.set(mintAddr, unpacked.supply.toString());
        } catch {
          // Ignore unpack errors on non-standard mints
        }
      });

      for (const candidate of candidates) {
        const onChainSupply = supplyByMint.get(candidate.mint);
        if (onChainSupply !== undefined) {
          candidate.supply = onChainSupply;
        }
      }
    } catch {
      // Non-fatal if getMultipleAccountsInfo fails
    }
  }

  return candidates;
}
