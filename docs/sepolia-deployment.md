# Sepolia Deployment Runbook

This document is the operational path for turning the local demo into public grant evidence on Sepolia.

## 1. Environment Template

Copy the template:

```bash
cp .env.example .env
```

Fill in these values:

- `SEPOLIA_RPC_URL`
  - your Sepolia RPC endpoint
- `DEPLOYER_PRIVATE_KEY`
  - funded Sepolia account that will deploy the contract
- `SIGNER_PRIVATE_KEY`
  - key used by the gateway to sign EIP-712 resolver responses
- `GATEWAY_URL`
  - final public HTTPS endpoint for `POST /resolve`
- `ETHERSCAN_API_KEY`
  - used for source verification

After deployment, also set:

- `RESOLVER_ADDRESS`
  - deployed `OffchainResolver` address

Optional:

- `ALLOWED_SIGNER_ADDRESS`
  - use this if you want deployment and verification to use an explicit signer address instead of deriving it from `SIGNER_PRIVATE_KEY`
- `ENS_NAME`
  - default is `alice.eth`
- `TEXT_KEY`
  - default is `url`
- `TEXT_VALUE`
  - custom text record output for signing tests

## 2. Deployment Order

The order matters:

1. Choose the final gateway URL first.
2. Deploy the resolver with that gateway URL in the constructor.
3. Start the gateway with the deployed `RESOLVER_ADDRESS`.
4. Verify the contract on Etherscan.
5. Run a live proof against the deployed resolver and public gateway.

The gateway is intentionally scoped to a single resolver address, so it should not be started until the deployment address is known.

## 3. Build

```bash
npm install
npm run build
```

## 4. Deploy To Sepolia

```bash
npm run deploy:sepolia
```

Expected output includes:

- deployed resolver address
- chain ID
- deployer address
- allowed signer address
- deployment transaction hash

Take the deployed address and write it into `.env`:

```bash
RESOLVER_ADDRESS=0xYourResolverAddress
```

## 5. Start The Gateway

```bash
npm run gateway
```

The gateway will:

- connect to Sepolia
- scope itself to `RESOLVER_ADDRESS`
- sign responses with `SIGNER_PRIVATE_KEY`
- derive `validUntil` from the latest chain timestamp

## 6. Verify On Etherscan

Recommended command:

```bash
npm run verify:sepolia
```

That script prints and runs the exact `forge verify-contract` command using:

- `RESOLVER_ADDRESS`
- `ETHERSCAN_API_KEY`
- the ABI-encoded constructor args for:
  - `allowedSigner`
  - `gatewayURL`

Underlying verification command shape:

```bash
forge verify-contract \
  --chain-id 11155111 \
  --watch \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  "$RESOLVER_ADDRESS" \
  contracts/OffchainResolver.sol:OffchainResolver
```

Where `CONSTRUCTOR_ARGS` is:

```text
abi.encode(address allowedSigner, string gatewayURL)
```

## 7. Run Live Proof

Once the gateway is public and the contract is deployed, run:

```bash
npm run prove:sepolia
```

This script:

1. calls `resolve()` on the deployed resolver
2. catches and decodes `OffchainLookup`
3. calls the live gateway
4. receives `(result, validUntil, signature)`
5. reconstructs the EIP-712 payload locally
6. checks the recovered signer
7. calls `resolveWithProof()` as a static call
8. prints the final resolved value

This is the best single command in the repo for proving the deployment is live and coherent.

## 8. Live Proof Checklist

Use this checklist before linking the repo in a grant application:

- `README.md` links to the public repo and clearly explains the architecture
- `contracts/OffchainResolver.sol` source is verified on Sepolia Etherscan
- deployed contract address is recorded in the README
- Etherscan verification link is recorded in the README
- public gateway URL is recorded in the README
- `allowedSigner` address is recorded in the README
- `npm run prove:sepolia` succeeds against the public deployment
- the proof output is saved in the grant materials or added to the README
- gateway is reachable over HTTPS
- the gateway signs for only the deployed resolver address
- the response expiry window is active and not hard-coded to stale timestamps
- a sample resolver query and returned value are documented

## 9. Recommended README Additions After Deployment

After the live Sepolia deployment exists, add a `Live Deployment` section to `README.md` with:

- network: `Sepolia`
- resolver contract address
- Etherscan link
- gateway URL
- allowed signer address
- sample proof output from `npm run prove:sepolia`

That turns the repo from a local technical demo into publicly verifiable grant evidence.
