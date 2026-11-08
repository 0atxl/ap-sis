"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { clusterApiUrl, Keypair } from "@solana/web3.js";
import {
  ConnectionProvider,
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
import "@solana/wallet-adapter-react-ui/styles.css";

const BURNER_KEYPAIR_STORAGE_KEY = "ap-sis:burner-secret-key";

/**
 * Persistent Burner Wallet that stores its keypair in localStorage,
 * ensuring the Devnet public key and funded balance persist across
 * browser reloads and re-connections.
 */
class PersistentBurnerWalletAdapter extends UnsafeBurnerWalletAdapter {
  override readonly name =
    "Burner wallet (devnet test only)" as typeof UnsafeBurnerWalletName;

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
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </RpcConfigContext.Provider>
  );
}
