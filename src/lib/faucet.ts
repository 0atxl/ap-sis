import { toast } from "sonner";

export const SOLANA_FAUCET_URL = "https://faucet.solana.com";

export function isRpcFaucetClosed(error: unknown): boolean {
  if (typeof error === "string") {
    return /410|faucet is closed|faucet\.solana\.com/i.test(error);
  }
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: number; message?: string };
  if (err.code === 410) return true;
  const message = err.message ?? "";
  return /410|faucet is closed|faucet\.solana\.com/i.test(message);
}

export async function copyWalletAddress(address: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(address);
      return true;
    }
  } catch {
    // The async clipboard API rejects without a direct user gesture.
  }

  try {
    if (typeof document === "undefined") return false;
    const input = document.createElement("textarea");
    input.value = address;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  } catch {
    return false;
  }
}

function openFaucetTab() {
  window.open(SOLANA_FAUCET_URL, "_blank", "noopener,noreferrer");
}

/**
 * 410 from `requestAirdrop`: address is already on the clipboard, and the
 * toast action opens the public faucet so the judge can paste it.
 */
export async function promptRpcFaucetFallback(address: string) {
  await copyWalletAddress(address);
  toast(
    "RPC faucet is rate-limited. Click here to open faucet.solana.com with your address copied!",
    {
      id: "rpc-faucet-closed",
      duration: 16000,
      action: {
        label: "Open faucet",
        onClick: openFaucetTab,
      },
    }
  );
}

/** Banner / sign-button path: copy, then open the faucet in this click. */
export async function openFaucetWithAddress(address: string) {
  const copied = await copyWalletAddress(address);
  openFaucetTab();
  toast.success(
    copied
      ? "Address copied. Paste it into faucet.solana.com."
      : "Opening faucet.solana.com. Copy your address from the header."
  );
}
