---
name: privy
description: >
  Expert knowledge base for building with Privy's authentication and wallet infrastructure SDK.
  Use this skill whenever a user asks about Privy integration, embedded wallets, Privy authentication,
  the PrivyProvider, Privy React SDK, Privy Node SDK, Privy REST API, login methods (email, SMS,
  OAuth, social login, SIWE, SIWS, Farcaster, Telegram, passkeys), wallet creation/signing/transactions,
  configuring EVM or Solana networks, customizing Privy UI appearance, or migrating from older Privy
  SDK versions. Trigger even when the user just mentions "Privy" or shows Privy-related imports.
---

# Privy Skill

Privy builds authentication and wallet infrastructure for crypto-enabled apps. It enables:
- **User onboarding** — Auth via email, SMS, social, wallet, passkeys; embedded wallets provisioned on login
- **Wallet infrastructure** — Create, sign, and transact with wallets on Ethereum (EVM) and Solana (SVM) from client or server

---

## Core Architecture

### Client-Side SDKs
| SDK | Package | Use Case |
|-----|---------|----------|
| React | `@privy-io/react-auth` | Web apps |
| React Native | `@privy-io/react-auth` | Mobile (Expo/RN) |
| Swift | Privy Swift SDK | iOS |
| Android | Privy Android SDK | Android (Kotlin) |
| Flutter | Privy Flutter SDK | Cross-platform mobile |
| Unity | Privy Unity SDK | Games |

### Server-Side SDKs
| SDK | Package |
|-----|---------|
| Node.js | `@privy-io/node` |
| Java, Python, Go, Rust | Privy server SDKs |

---

## React SDK Setup

### Installation
```bash
npm install @privy-io/react-auth@latest
# For Solana wallets, also install:
# @solana/kit @solana-program/memo @solana-program/system @solana-program/token
```

### PrivyProvider Setup (required — wrap app root)
```tsx
'use client'; // Next.js
import { PrivyProvider } from '@privy-io/react-auth';

export default function Providers({ children }) {
  return (
    <PrivyProvider
      appId="your-privy-app-id"
      clientId="your-app-client-id"  // optional
      config={{
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          // solana: { createOnLogin: 'users-without-wallets' }
        }
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

### Wait for Ready State
Always check `ready` before consuming Privy state:
```tsx
import { usePrivy } from '@privy-io/react-auth';
const { ready } = usePrivy();
if (!ready) return <div>Loading...</div>;
```

---

## Authentication

### Email Login (OTP)
```tsx
import { useLoginWithEmail } from '@privy-io/react-auth';
const { sendCode, loginWithCode } = useLoginWithEmail();

// Step 1: send OTP
await sendCode({ email: 'user@example.com' });
// Step 2: verify OTP
await loginWithCode({ code: '123456' });
```

### Supported Login Methods
- **Email** — OTP (10 min validity)
- **SMS** — OTP; US/Canada on all plans; international on Scale/Enterprise
- **OAuth** — Google, Twitter/X, Apple, Discord, GitHub, LinkedIn, Instagram, Spotify, TikTok, Twitch, LINE
- **SIWE** — Sign In with Ethereum (any EVM wallet)
- **SIWS** — Sign In with Solana (any SVM wallet)
- **Farcaster** — React and React Native only
- **Telegram** — React only; requires bot token + domain config
- **Passkeys** — React, React Native, Swift, Android, Flutter
- **Custom Auth** — Bring your own JWT (Auth0, Stytch, Firebase, etc.)

### OAuth Configuration
Default credentials work out of the box. For production, configure your own:
1. Create OAuth app with provider
2. Set redirect URI: `https://auth.privy.io/api/v1/oauth/callback`
3. Enter credentials in Privy Dashboard → Login Methods → Socials

> ⚠️ Apple, LinkedIn, and TikTok credentials **cannot** be changed once users exist.

---

## Embedded Wallets

### Create Wallets
**Automatically on login** (via `PrivyProvider` config):
```tsx
embeddedWallets: {
  ethereum: { createOnLogin: 'users-without-wallets' }, // or 'all-users' | 'off'
  solana:   { createOnLogin: 'users-without-wallets' }
}
```

**Manually** via hooks: use `useCreateWallet` from `@privy-io/react-auth` (EVM) or `@privy-io/react-auth/solana` (Solana).

### Send Ethereum Transaction
```tsx
import { useSendTransaction } from '@privy-io/react-auth';
const { sendTransaction } = useSendTransaction();

await sendTransaction({
  to: '0xRecipientAddress',
  value: 100000  // in wei
});
```

### Send Solana Transaction
```tsx
import { useSignAndSendTransaction } from '@privy-io/react-auth/solana';
const { signAndSendTransaction } = useSignAndSendTransaction();

await signAndSendTransaction({
  wallet,
  transaction,  // Uint8Array
  chain: 'solana:devnet'
});
```

### Key React Hooks (v3)
| Hook | Import | Purpose |
|------|--------|---------|
| `usePrivy` | `@privy-io/react-auth` | Auth state, `ready`, `authenticated` |
| `useWallets` | `@privy-io/react-auth` | EVM wallets |
| `useWallets` | `@privy-io/react-auth/solana` | Solana wallets |
| `useSendTransaction` | `@privy-io/react-auth` | Send EVM tx |
| `useSignAndSendTransaction` | `@privy-io/react-auth/solana` | Send Solana tx |
| `useCreateWallet` | per chain entrypoint | Create wallet |
| `useExportWallet` | per chain entrypoint | Export wallet key |
| `useLoginWithEmail` | `@privy-io/react-auth` | Email OTP login |
| `useLoginWithSiws` | `@privy-io/react-auth` | Solana wallet login |

---

## Network Configuration

### EVM Networks
```tsx
import { base, polygon, arbitrum } from 'viem/chains';

<PrivyProvider config={{
  defaultChain: base,
  supportedChains: [base, polygon, arbitrum]
}}>
```

Custom chains via `defineChain` from `viem`. Override RPC with `addRpcUrlOverrideToChain` from `@privy-io/chains`.

**Default supported chains** include: Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, Celo, Linea, Zora, and their testnets.

### Solana Networks
```tsx
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

<PrivyProvider config={{
  solana: {
    rpcs: {
      'solana:mainnet': {
        rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
        rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com')
      }
    }
  }
}}>
```

---

## UI Appearance Customization

All via `config.appearance` in `PrivyProvider`:

```tsx
<PrivyProvider config={{
  appearance: {
    theme: 'dark',              // 'light' | 'dark' | '#hexcolor'
    logo: 'https://...',        // override dashboard logo
    landingHeader: 'Welcome',   // ≤35 chars
    loginMessage: 'Sign in to continue', // ≤100 chars
    showWalletLoginFirst: false,
  }
}}>
```

**CSS variable overrides** (in `body` CSS):
```css
body {
  --privy-color-accent: #your-brand-color;
  --privy-border-radius-md: 8px;
  --privy-color-background: #ffffff;
  /* see docs for full list */
}
```

---

## Node.js Server SDK

### Setup
```bash
npm install @privy-io/node@latest
```

```ts
import { PrivyClient } from '@privy-io/node';
const privy = new PrivyClient({
  appId: 'your-app-id',
  appSecret: 'your-app-secret'
});
```

### Create Wallet
```ts
const wallet = await privy.wallets().create({ chain_type: 'ethereum' }); // or 'solana'
const walletId = wallet.id;
```

### Sign Message
```ts
// Ethereum
const { signature } = await privy.wallets().ethereum().signMessage(walletId, { message: 'Hello' });

// Solana (base64 encoded)
const base64Msg = Buffer.from('Hello', 'utf8').toString('base64');
const { signature } = await privy.wallets().solana().signMessage(walletId, { message: base64Msg });
```

### Send Transaction
```ts
// Ethereum
const { hash } = await privy.wallets().ethereum().sendTransaction(walletId, {
  caip2: 'eip155:11155111',  // Sepolia
  params: { transaction: { to: recipientAddress, value: '0x1', chain_id: 11155111 } }
});

// Solana
const { hash } = await privy.wallets().solana().signAndSendTransaction(walletId, {
  caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  transaction: base64EncodedTx
});
```

### Create User
```ts
const user = await privy.users().create({
  linked_accounts: [
    { type: 'email', address: 'user@example.com' },
    { type: 'custom_auth', custom_user_id: 'external-id' }
  ]
});
```

### Error Handling
```ts
import { APIError, PrivyAPIError } from '@privy-io/node';
try {
  // ...
} catch (error) {
  if (error instanceof APIError) {
    console.log(error.status, error.name); // HTTP error
  } else if (error instanceof PrivyAPIError) {
    console.log(error.message); // Privy SDK error
  }
}
```

---

## Migration: v2 → v3 (React SDK)

Key breaking changes:
- `useSolanaWallets` → `useWallets` + `useCreateWallet` + `useExportWallet` from `/solana` entrypoint
- `useSendTransaction` (Solana) → `useSignAndSendTransaction`
- `solanaClusters` config → `config.solana.rpcs` with `createSolanaRpc`
- `embeddedWallets.createOnLogin` → `embeddedWallets.ethereum.createOnLogin` or `embeddedWallets.solana.createOnLogin`
- `detected_wallets` → `detected_ethereum_wallets` / `detected_solana_wallets`
- `useSignAuthorization` → `useSign7702Authorization`
- `useSetWalletPassword` → `useSetWalletRecovery`
- `useLoginToFrame` → `useLoginToMiniApp`
- `verifiedAt` on linked accounts → `firstVerifiedAt` / `latestVerifiedAt`

## Migration: `@privy-io/server-auth` → `@privy-io/node`

```ts
// Old
import { PrivyClient } from '@privy-io/server-auth';
const privy = new PrivyClient('app-id', 'app-secret');
privy.walletApi.createWallet(...)

// New
import { PrivyClient } from '@privy-io/node';
const privy = new PrivyClient({ appId: 'app-id', appSecret: 'app-secret' });
privy.wallets().create(...)
privy.users().create(...)
privy.policies().create(...)
```

---

## Dashboard Quick Reference

- **App ID & Secret**: Dashboard → App Settings
- **Login Methods**: Dashboard → Authentication
- **UI Customization**: Dashboard → UI Components → Branding
- **Wallets/Users**: Scoped per app
- **Team Roles**: Admin, Developer, Viewer

---

## Common Patterns & Gotchas

1. **`PrivyProvider` must wrap all components** using Privy hooks — put it as close to the root as possible.
2. **Check `ready` before using Privy state** — avoids stale/incorrect state on initial render.
3. **Google OAuth may fail in in-app browsers** (IABs) due to Google restrictions; other providers unaffected.
4. **For production OAuth**, always configure your own credentials (not Privy defaults).
5. **Solana messages must be base64-encoded** when using the Node SDK.
6. **`defaultChain` must be in `supportedChains`** or PrivyProvider throws.
7. **Custom RPC recommended at scale** — Privy's default RPCs have rate limits suited for development.
8. **Telegram login requires tunneling** (ngrok/Cloudflare) for local dev since domain must be set on the bot.
9. **SMS pricing**: US/Canada included; international requires Scale/Enterprise plan; Twilio costs passed through.
