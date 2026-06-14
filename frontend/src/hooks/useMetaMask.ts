import { useState, useCallback, useEffect } from 'react';

export interface MetaMaskState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  isAvailable: boolean;
}

export function useMetaMask() {
  const isAvailable =
    typeof window !== 'undefined' && Boolean(window.ethereum);

  const [state, setState] = useState<MetaMaskState>({
    address: null,
    connecting: false,
    error: null,
    isAvailable,
  });

  // Sync if wallet already connected (page reload)
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setState((s) => ({ ...s, address: list[0] }));
      })
      .catch(() => {});
  }, []);

  // React to account / chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setState((s) => ({ ...s, address: list[0] ?? null }));
    };
    window.ethereum.on('accountsChanged', onAccounts);
    return () => window.ethereum?.removeListener('accountsChanged', onAccounts);
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    if (!window.ethereum) {
      setState((s) => ({ ...s, error: 'MetaMask is not installed' }));
      return null;
    }
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const address = accounts[0] ?? null;
      setState((s) => ({ ...s, address, connecting: false }));
      return address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection rejected';
      setState((s) => ({ ...s, connecting: false, error: msg }));
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((s) => ({ ...s, address: null, error: null }));
  }, []);

  /**
   * Sign a plain-text message using MetaMask's personal_sign (EIP-191).
   * No gas required — purely a cryptographic signature.
   */
  const signMessage = useCallback(
    async (message: string): Promise<string | null> => {
      if (!window.ethereum || !state.address) return null;
      try {
        // Convert message to hex for personal_sign
        const hexMsg =
          '0x' +
          Array.from(new TextEncoder().encode(message))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        const signature = (await window.ethereum.request({
          method: 'personal_sign',
          params: [hexMsg, state.address],
        })) as string;
        return signature;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Signing rejected';
        setState((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    [state.address],
  );

  return { ...state, connect, disconnect, signMessage };
}
