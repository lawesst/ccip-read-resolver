# OffchainResolver: CCIP-Read + EIP-712 Evidence Repo

This repository is a minimal working project intended as verifiable previous-work evidence for an ENS Ecosystem grant application.

It demonstrates three core capabilities in a concrete, runnable form:

- EIP-3668 CCIP-Read with `OffchainLookup`
- EIP-712 typed data signing
- Offchain data resolution with onchain signature verification

The implementation is intentionally small, but the cryptographic and protocol flow is real. The contract reverts with `OffchainLookup`, a gateway signs a typed response offchain, and the resolver verifies that signature onchain before returning the resolved bytes.

## Project Description

This project implements a minimal ENS-style offchain resolver. A client calls `resolve()`, the contract triggers CCIP-Read by reverting with `OffchainLookup`, an Express gateway constructs and signs a response, and the contract verifies that signed payload in `resolveWithProof()`.

The demo is designed to be easy to inspect in a grant review:

- the Solidity resolver is self-contained
- the EIP-712 schema is shared between contract and TypeScript
- the gateway is minimal and realistic
- the end-to-end script exercises the full resolver -> gateway -> resolver round-trip

## What This Demonstrates

- Understanding of EIP-3668: the contract uses the `OffchainLookup` pattern correctly and returns through a callback function
- Understanding of EIP-712: the gateway signs typed data that is reconstructed and verified onchain
- Understanding of offchain resolution security: the signed payload binds together the request, response, expiry, chain, and resolver address
- Understanding of the full CCIP-Read lifecycle: the demo script catches the revert, extracts the request, calls the gateway, and submits the signed proof back onchain

## Repository Layout

```text
.
├── contracts/OffchainResolver.sol
├── gateway/server.ts
├── scripts/sign.ts
├── scripts/deploy.ts
├── scripts/demo.ts
├── src/
├── test/OffchainResolver.t.sol
└── README.md
```

## Key Files

- `contracts/OffchainResolver.sol`
  - Solidity resolver using `OffchainLookup`
  - EIP-712 domain separator
  - onchain verification of `(result, validUntil, signature)`
- `scripts/sign.ts`
  - signs a sample response with the exact same domain and typed struct used by the contract
- `gateway/server.ts`
  - minimal Express gateway with `POST /resolve`
  - returns `result`, `validUntil`, and `signature`
- `scripts/demo.ts`
  - simulates the full CCIP-Read flow end to end
- `test/OffchainResolver.t.sol`
  - proves valid proof success, expired proof failure, and wrong signer failure

## How CCIP-Read Works In This Repo

1. A client calls `resolve(name, data)` on `OffchainResolver`.
2. The contract reverts with `OffchainLookup`.
3. The revert contains:
   - the gateway URL
   - encoded request data
   - the callback selector for `resolveWithProof(bytes,bytes)`
4. The client sends the original request to the gateway.
5. The gateway signs a typed EIP-712 payload containing:
   - `name`
   - `data`
   - `result`
   - `validUntil`
   - `resolver`
6. The client calls `resolveWithProof(response, extraData)`.
7. The contract:
   - decodes `(result, validUntil, signature)`
   - rejects expired responses
   - rebuilds the EIP-712 digest
   - recovers the signer with OpenZeppelin `ECDSA`
   - requires the signer to equal `allowedSigner`
   - returns the final resolver result

## Security Properties Demonstrated

- The signature is bound to the resolver contract address.
- The signature is bound to the current chain through the EIP-712 domain separator.
- The signature is bound to the exact request inputs: `name` and `data`.
- The signature is bound to the exact response bytes: `result`.
- The response expires at `validUntil`, preventing indefinite replay.
- Only the configured `allowedSigner` is accepted onchain.

## How To Run

### 1. Install dependencies

```bash
npm install
```

### 2. Start a local chain

```bash
anvil
```

Default local accounts used by the demo:

- deployer: Anvil account `0`
- signer: Anvil account `1`
- RPC URL: `http://127.0.0.1:8545`

### 3. Build the contract

```bash
npm run build
```

### 4. Generate a sample EIP-712 signature

```bash
npm run sign
```

This outputs:

- the typed data domain
- the typed struct definition
- the sample payload
- the signature
- the ABI-encoded `(result, validUntil, signature)` response

### 5. Run tests

```bash
npm run test
```

### 6. Run the full end-to-end demo

```bash
npm run demo
```

This script:

1. deploys the resolver
2. calls `resolve()`
3. catches `OffchainLookup`
4. extracts the encoded request
5. calls the gateway
6. receives the signed response
7. calls `resolveWithProof()`
8. prints the final resolved value

### 7. Optional: run the gateway as a standalone service

First deploy the resolver:

```bash
npm run deploy
```

Then start the gateway for that resolver address:

```bash
RESOLVER_ADDRESS=0xYourResolverAddress npm run gateway
```

Gateway endpoint:

```text
POST http://127.0.0.1:3000/resolve
```

Expected request body:

```json
{
  "resolver": "0xResolverAddress",
  "name": "0x...",
  "data": "0x..."
}
```

Example response:

```json
{
  "result": "0x...",
  "validUntil": 1710000000,
  "signature": "0x..."
}
```

## Example Output

Example successful `npm run demo` output:

```text
Resolver deployed at 0x5FbDB2315678afecb367f032d93F642f64180aa3
Allowed signer: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
OffchainLookup sender: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Extracted callData: 0x...
Gateway URL: http://127.0.0.1:49183/resolve
Callback selector: 0xf4d4d2f8
Recovered signer: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Final resolved value: https://resolver.demo/alice.eth/url
```

## Verification

This repository includes:

- runnable Solidity contract
- runnable signing script
- runnable gateway
- runnable end-to-end CCIP-Read simulation
- Foundry tests for the core verification paths
- CI checks for build and test coverage

That combination is intended to make the repo suitable for GitHub publication and direct inclusion as technical evidence in a grant application.
