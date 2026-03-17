# CCIP-Read Flow

This repository is structured around the three trust boundaries in an ENS CCIP-Read resolver:

- `contracts/`
  - Onchain verifier and `OffchainLookup` entrypoint
- `gateway/`
  - HTTP service that produces signed responses
- `scripts/`
  - Reproducible demo, deployment, and signing utilities
- `src/`
  - Shared TypeScript helpers so the gateway and scripts use the same ABI and EIP-712 definitions
- `test/`
  - Onchain verification tests for signature validity, expiry, and signer authorization

## Message Flow

1. `resolve(name, data)` reverts with `OffchainLookup`.
2. A client POSTs the revert payload to the gateway.
3. The gateway reconstructs the resolver result.
4. The gateway signs the typed payload:
   - `name`
   - `data`
   - `result`
   - `validUntil`
   - `resolver`
5. The client calls `resolveWithProof(response, extraData)`.
6. The contract verifies expiry, rebuilds the EIP-712 digest, recovers the signer, and returns the result bytes.

## Repo Credibility Signals

- Shared signing definitions live in one place: `src/signing.ts`
- The public evidence artifacts live at `contracts/OffchainResolver.sol`, `scripts/sign.ts`, `gateway/server.ts`, and `scripts/demo.ts`
- The gateway is resolver-scoped, so it does not sign arbitrary user-supplied resolver addresses
- `validUntil` is derived from chain time in the live gateway paths
- Foundry tests cover valid, expired, and unauthorized responses
- GitHub Actions runs typechecking, contract build, unit tests, and the full local demo
