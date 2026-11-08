import { NextResponse } from "next/server";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const FUND_LAMPORTS = Math.round(0.05 * LAMPORTS_PER_SOL);
const SKIP_IF_BALANCE_AT_LEAST = Math.round(0.03 * LAMPORTS_PER_SOL);
const MIN_FUNDER_LAMPORTS = Math.round(0.2 * LAMPORTS_PER_SOL);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ipFundedAt = new Map<string, number[]>();
const addressFundedAt = new Map<string, number>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "local";
}

function recentIpHits(ip: string): number[] {
  const now = Date.now();
  const recent = (ipFundedAt.get(ip) ?? []).filter((at) => now - at < HOUR_MS);
  ipFundedAt.set(ip, recent);
  return recent;
}

function addressFundedRecently(address: string): boolean {
  const at = addressFundedAt.get(address);
  if (at == null) return false;
  if (Date.now() - at >= DAY_MS) {
    addressFundedAt.delete(address);
    return false;
  }
  return true;
}

function readFunder(): Keypair {
  const raw = process.env.DEMO_FUNDER_SECRET_KEY;
  if (!raw) {
    throw new Error("Demo funder is not configured");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Demo funder is not configured");
  }
  if (!Array.isArray(parsed) || parsed.length < 64) {
    throw new Error("Demo funder is not configured");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

export async function POST(request: Request) {
  let address = "";
  try {
    const body = (await request.json()) as { address?: unknown };
    address = typeof body.address === "string" ? body.address.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(address);
  } catch {
    return NextResponse.json(
      { error: "Address is not a valid base58 public key" },
      { status: 400 }
    );
  }

  const endpoint =
    process.env.DEMO_RPC_URL?.trim() || clusterApiUrl("devnet");
  const connection = new Connection(endpoint, "confirmed");

  try {
    const currentBalance = await connection.getBalance(recipient, "confirmed");
    if (currentBalance >= SKIP_IF_BALANCE_AT_LEAST) {
      return NextResponse.json({
        funded: false,
        balanceLamports: currentBalance,
      });
    }

    if (addressFundedRecently(address)) {
      return NextResponse.json(
        { error: "This demo wallet was already funded today." },
        { status: 429 }
      );
    }

    const ip = clientIp(request);
    if (recentIpHits(ip).length >= 3) {
      return NextResponse.json(
        { error: "Demo funding is limited to 3 wallets per hour from this network." },
        { status: 429 }
      );
    }

    const funder = readFunder();
    const funderBalance = await connection.getBalance(funder.publicKey, "confirmed");
    if (funderBalance < MIN_FUNDER_LAMPORTS) {
      return NextResponse.json(
        { error: "Demo funds are temporarily exhausted" },
        { status: 503 }
      );
    }

    const latest = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      feePayer: funder.publicKey,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }).add(
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: recipient,
        lamports: FUND_LAMPORTS,
      })
    );
    tx.sign(funder);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed"
    );

    const now = Date.now();
    const hits = recentIpHits(ip);
    hits.push(now);
    ipFundedAt.set(ip, hits);
    addressFundedAt.set(address, now);

    const balanceLamports = await connection.getBalance(recipient, "confirmed");
    return NextResponse.json({ funded: true, balanceLamports });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not fund the demo wallet";
    const status = message === "Demo funder is not configured" ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
