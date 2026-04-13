# CCIP-Read & Signed Offchain Data Starter Kit

An open-source starter kit for signed offchain reads using EIP-3668 and EIP-712.

The repository packages a reusable onchain verification base, a minimal gateway, and two example integrations:

- `OffchainResolver`: an ENS reference integration using ENSIP-10, `text(bytes32,string)`, and `addr(bytes32)`
- `SignedConfigReader`: a non-ENS example for serving signed string configuration values

The goal is to give Ethereum application developers a small but real codebase they can inspect, run, and extend without rebuilding the core proof-verification flow from scratch.

## Why This Repo Exists

Many Ethereum applications need data that lives offchain but still needs a verifiable trust boundary onchain or through standard clients. The tricky parts are always the same:

- triggering an offchain read with `OffchainLookup`
- formatting gateway requests and callbacks correctly
- signing responses with EIP-712
- binding proofs to the contract, request, response, and chain
- rejecting expired or replayed responses

This starter kit isolates those concerns into reusable pieces and demonstrates them in two concrete contexts.

## What’s Included

| Component | Purpose |
| --- | --- |
| `contracts/BaseSignedOffchainReader.sol` | Shared EIP-3668 + EIP-712 verification base |
| `contracts/OffchainResolver.sol` | ENS reference integration |
| `contracts/SignedConfigReader.sol` | Generic signed config example |
| `gateway/server.ts` | Minimal Express gateway for signed responses |
| `src/signing.ts` | Shared EIP-712 domain and signing helpers |
| `src/ens.ts` | ENS request/result codecs |
| `src/config-reader.ts` | Non-ENS config request/result codecs |
| `scripts/demo.ts` | Local ENS demo |
| `scripts/demo-config.ts` | Local non-ENS config demo |
| `scripts/sign.ts` | Sample signing script for ENS or config payloads |
| `scripts/deploy.ts` | Deploy `OffchainResolver` or `SignedConfigReader` |
| `scripts/verify.ts` | Verify a deployed contract on Etherscan |

## Architecture

The starter kit has three trust boundaries:

1. Onchain verifier
   - A contract function reverts with `OffchainLookup`.
   - The callback function verifies the gateway signature and returns the decoded result.

2. Offchain gateway
   - Accepts a callback-compatible request payload.
   - Reconstructs the result bytes for the requested integration.
   - Signs the response with EIP-712.

3. Shared signing layer
   - Keeps the EIP-712 type definition, ABI response encoding, and signer recovery logic in one place so contracts, scripts, and the gateway stay aligned.

The full flow is documented in [docs/ccip-read-flow.md](docs/ccip-read-flow.md).

## Security Properties

Every accepted response is bound to:

- the verifying contract address
- the active chain ID
- the exact request bytes
- the exact returned result bytes
- an expiry timestamp

The callback rejects:

- expired responses
- responses signed by the wrong signer
- malformed responses that do not match the original request

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start a local chain

```bash
anvil
```

### 3. Build the contracts

```bash
npm run build
```

### 4. Run tests

```bash
npm run test
```

### 5. Run the ENS reference demo

```bash
npm run demo
```

This deploys `OffchainResolver`, starts a local gateway, executes the full `OffchainLookup -> gateway -> resolveWithProof` round trip, and prints the final `text(bytes32,string)` value.

### 6. Run the non-ENS config demo

```bash
npm run demo:config
```

This deploys `SignedConfigReader`, starts the same gateway, requests `getString("app.name")`, and verifies the signed callback onchain.

### 7. Generate sample signed payloads

ENS sample:

```bash
npm run sign
```

Config sample:

```bash
SAMPLE_KIND=config npm run sign
```

## Standalone Gateway

Start the gateway against a deployed verifier contract:

```bash
RESOLVER_ADDRESS=0xYourContractAddress npm run gateway
```

Supported query families:

- `text(bytes32,string)`
- `addr(bytes32)`
- `getString(string)`

Standard CCIP-Read request body:

```json
{
  "sender": "0xVerifierAddress",
  "data": "0xOffchainLookupCallData"
}
```

Demo-friendly request body:

```json
{
  "resolver": "0xVerifierAddress",
  "name": "0xRequestBytes",
  "data": "0xApplicationCalldata"
}
```

The gateway serves:

- `GET /`
- `GET /healthz`
- `POST /resolve`

Render configuration lives in [render.yaml](render.yaml).

## Deployment

Copy the environment template:

```bash
cp .env.example .env
```

Useful variables:

- `CONTRACT_NAME`
  - `OffchainResolver`
  - `SignedConfigReader`
- `SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `SIGNER_PRIVATE_KEY`
- `GATEWAY_URL`
- `ETHERSCAN_API_KEY`

Deploy the selected contract:

```bash
npm run build
npm run deploy:sepolia
```

Verify it:

```bash
npm run verify:sepolia
```

The Sepolia runbook is in [docs/sepolia-deployment.md](docs/sepolia-deployment.md).

## ENS Reference Integration

The ENS example remains the live public reference integration for this project.

Current public artifacts:

- Repository: [lawesst/signed-offchain-data-starter-kit](https://github.com/lawesst/signed-offchain-data-starter-kit)
- Verified Sepolia resolver: [0x596EBB34AD8A020693E596EB03472daF57aF7910](https://sepolia.etherscan.io/address/0x596EBB34AD8A020693E596EB03472daF57aF7910#code)
- Gateway: [https://ccip-read-resolver-2.onrender.com/resolve](https://ccip-read-resolver-2.onrender.com/resolve)
- Live name: `chrisfranko.eth`

Smoke-test commands:

```bash
npm run prove:sepolia
npm run check-name:sepolia
```

The live ENS name currently resolves through standard `ethers` client flows for:

- `addr(bytes32)`
- `text(bytes32,string)` with `TEXT_KEY=url`

## Environment Variables

The `.env.example` file includes values for both integrations.

ENS-oriented values:

- `ENS_NAME`
- `TEXT_KEY`
- `TEXT_VALUE`
- `ADDR_VALUE`
- `TARGET_ENS_NAME`

Generic config example values:

- `CONFIG_KEY`
- `CONFIG_VALUE`

## Repo Layout

```text
.
├── contracts/
│   ├── BaseSignedOffchainReader.sol
│   ├── OffchainResolver.sol
│   └── SignedConfigReader.sol
├── gateway/
│   └── server.ts
├── scripts/
│   ├── check-name.ts
│   ├── demo.ts
│   ├── demo-config.ts
│   ├── deploy.ts
│   ├── set-resolver.ts
│   ├── sign.ts
│   └── verify.ts
├── src/
│   ├── config-reader.ts
│   ├── ens.ts
│   ├── gateway.ts
│   ├── runtime.ts
│   └── signing.ts
└── test/
```

## Notes

- The ENS reference integration is live on Sepolia.
- The generic config-reader flow is currently the local non-ENS example packaged with the starter kit.
- The gateway is intentionally small. It is meant as a reference implementation, not a production service.

## License

MIT
