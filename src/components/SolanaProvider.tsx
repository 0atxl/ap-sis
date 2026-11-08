"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clusterApiUrl, Keypair } from "@solana/web3.js";
import {
  ConnectionProvider,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  CoinbaseWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  UnsafeBurnerWalletAdapter,
  UnsafeBurnerWalletName,
} from "@solana/wallet-adapter-wallets";
import {
  WalletNotReadyError,
  WalletReadyState,
  type Adapter,
  type WalletError,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { toast } from "sonner";
import "@solana/wallet-adapter-react-ui/styles.css";

export const BURNER_WALLET_NAME =
  "Burner wallet (devnet test only)" as WalletName;

const EXTENSION_WALLET_NAMES = new Set<string>([
  "Phantom",
  "Solflare",
  "Coinbase Wallet",
]);

type InjectedWalletWindow = Window & {
  solana?: { isPhantom?: boolean };
  phantom?: { solana?: { isPhantom?: boolean } };
  solflare?: { isSolflare?: boolean };
  coinbaseSolana?: unknown;
};

export function isBrowserExtensionPresent(walletName: string): boolean {
  if (typeof window === "undefined") return false;
  const injected = window as InjectedWalletWindow;
  if (walletName === "Phantom") {
    return Boolean(
      injected.phantom?.solana?.isPhantom || injected.solana?.isPhantom
    );
  }
  if (walletName === "Solflare") {
    return Boolean(injected.solflare?.isSolflare);
  }
  if (walletName === "Coinbase Wallet") {
    return Boolean(injected.coinbaseSolana);
  }
  return false;
}

function promptForMissingExtension(walletName: string) {
  toast.error(
    `${walletName} was not detected. Install it, or use the demo wallet.`,
    {
      id: `missing-extension-${walletName}`,
      duration: 12000,
    }
  );
}

/**
 * The stock modal only calls `select()`. Phantom stays `NotDetected` without
 * the extension, so connect is never attempted and the click looks like a no-op.
 * Solflare stays `Loadable` and would otherwise open a blank SDK popup.
 */
function MissingExtensionGuide() {
  const { wallet, select } = useWallet();

  useEffect(() => {
    if (!wallet) return;
    const name = wallet.adapter.name;
    if (!EXTENSION_WALLET_NAMES.has(name)) return;
    if (wallet.readyState === WalletReadyState.Installed) return;
    if (isBrowserExtensionPresent(name)) return;

    promptForMissingExtension(name);
    select(null);
  }, [select, wallet]);

  return null;
}

const BURNER_KEYPAIR_STORAGE_KEY = "ap-sis:burner-secret-key";

/**
 * Persistent Burner Wallet that stores its keypair in localStorage,
 * ensuring the Devnet public key and funded balance persist across
 * browser reloads and re-connections.
 */
class PersistentBurnerWalletAdapter extends UnsafeBurnerWalletAdapter {
  override readonly name = BURNER_WALLET_NAME as typeof UnsafeBurnerWalletName;

  override async connect(): Promise<void> {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(BURNER_KEYPAIR_STORAGE_KEY);
        if (stored) {
          // @ts-expect-error keypair assignment on burner adapter
          this._keypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(stored))
          );
        } else {
          const fresh = new Keypair();
          // @ts-expect-error keypair assignment on burner adapter
          this._keypair = fresh;
          window.localStorage.setItem(
            BURNER_KEYPAIR_STORAGE_KEY,
            JSON.stringify(Array.from(fresh.secretKey))
          );
        }
      } catch {
        // @ts-expect-error fallback keypair
        this._keypair = new Keypair();
      }
    } else {
      // @ts-expect-error fallback keypair
      this._keypair = new Keypair();
    }
    // @ts-expect-error keypair exists
    this.emit("connect", this._keypair.publicKey);
  }
}

export const DEFAULT_DEVNET_RPC = clusterApiUrl("devnet");
const RPC_STORAGE_KEY = "ap-sis:devnet-rpc-url";

interface RpcConfigContextValue {
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  resetRpcUrl: () => void;
}

const RpcConfigContext = createContext<RpcConfigContextValue>({
  rpcUrl: DEFAULT_DEVNET_RPC,
  setRpcUrl: () => {},
  resetRpcUrl: () => {},
});

export function useRpcConfig() {
  return useContext(RpcConfigContext);
}

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const [rpcUrl, setRpcUrlState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(RPC_STORAGE_KEY)?.trim();
        if (saved && /^https?:\/\//i.test(saved)) {
          return saved;
        }
      } catch {
        // Ignore localStorage restrictions
      }
    }
    return DEFAULT_DEVNET_RPC;
  });

  const setRpcUrl = useCallback((nextUrl: string) => {
    const trimmed = nextUrl.trim();
    const validUrl = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : DEFAULT_DEVNET_RPC;
    setRpcUrlState(validUrl);
    try {
      window.localStorage.setItem(RPC_STORAGE_KEY, validUrl);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const resetRpcUrl = useCallback(() => {
    setRpcUrlState(DEFAULT_DEVNET_RPC);
    try {
      window.localStorage.removeItem(RPC_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new PersistentBurnerWalletAdapter(),
    ],
    []
  );

  const shouldAutoConnect = useCallback(async (adapter: Adapter) => {
    if (
      EXTENSION_WALLET_NAMES.has(adapter.name) &&
      !isBrowserExtensionPresent(adapter.name)
    ) {
      return false;
    }
    return true;
  }, []);

  const handleWalletError = useCallback(
    (error: WalletError, adapter?: Adapter) => {
      const name = adapter?.name ?? "Wallet";
      const missingExtension =
        error instanceof WalletNotReadyError ||
        error.name === "WalletNotReadyError";
      if (missingExtension && EXTENSION_WALLET_NAMES.has(name)) {
        promptForMissingExtension(name);
        return;
      }
      toast.error(error.message || `${name} could not connect.`);
    },
    []
  );

  const contextValue = useMemo(
    () => ({ rpcUrl, setRpcUrl, resetRpcUrl }),
    [rpcUrl, setRpcUrl, resetRpcUrl]
  );

  return (
    <RpcConfigContext.Provider value={contextValue}>
      <ConnectionProvider
        endpoint={rpcUrl}
        config={{ commitment: "confirmed" }}
      >
        <WalletProvider
          wallets={wallets}
          autoConnect={shouldAutoConnect}
          onError={handleWalletError}
        >
          <WalletModalProvider>
            <MissingExtensionGuide />
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </RpcConfigContext.Provider>
  );
}
