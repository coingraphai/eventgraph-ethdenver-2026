import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { ReactNode, useMemo } from 'react';
import { base, mainnet, polygon, arbitrum, optimism, bsc, gnosis, avalanche, fantom } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

interface OnchainKitWrapperProps {
  children: ReactNode;
}

export function OnchainKitWrapper({ children }: OnchainKitWrapperProps) {
  // Create wagmi config with wallet connectors
  const wagmiConfig = useMemo(() => createConfig({
    chains: [base, mainnet, polygon, arbitrum, optimism, bsc, gnosis, avalanche, fantom],
    connectors: [
      // MetaMask - browser extension
      injected({
        target: 'metaMask',
      }),
      // Coinbase Wallet - original working config
      coinbaseWallet({
        appName: 'EventGraph AI',
        preference: 'smartWalletOnly',
      }),
    ],
    transports: {
      [base.id]: http(),
      [mainnet.id]: http(),
      [polygon.id]: http(),
      [arbitrum.id]: http(),
      [optimism.id]: http(),
      [bsc.id]: http(),
      [gnosis.id]: http(),
      [avalanche.id]: http(),
      [fantom.id]: http(),
    },
  }), []);

  // Create query client
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={import.meta.env.VITE_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: 'dark', // Match EventGraph AI dark theme
            },
            wallet: {
              display: 'modal', // Use modal display for wallet connection
            },
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
