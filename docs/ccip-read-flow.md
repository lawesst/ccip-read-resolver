# CCIP-Read Flow

This repository is structured around the three trust boundaries in a signed offchain data starter kit:

- `contracts/`
  - Reusable verifier base plus example integrations
- `gateway/`
  - HTTP service that produces signed responses
- `scripts/`
  - Reproducible demos, deployment, and signing utilities
- `src/`
  - Shared TypeScript helpers so the gateway and scripts use the same ABI and EIP-712 definitions
- `test/`
  - Onchain verification tests for signature validity, expiry, signer authorization, and example integrations

## Message Flow

1. A contract function such as `resolve(name, data)` or `getString(key)` reverts with `OffchainLookup`.
2. A client POSTs the revert payload to the gateway.
3. The gateway reconstructs the application result.
4. The gateway signs the typed payload:
   - `name`
   - `data`
   - `result`
   - `validUntil`
   - `resolver`
5. The client calls the callback function with `(response, extraData)`.
6. The contract verifies expiry, rebuilds the EIP-712 digest, recovers the signer, and returns the result bytes.

## Repo Credibility Signals

- Shared signing definitions live in one place: `src/signing.ts`
- The starter kit has both ENS and non-ENS examples: `contracts/OffchainResolver.sol` and `contracts/SignedConfigReader.sol`
- The gateway is resolver-scoped, so it does not sign arbitrary user-supplied resolver addresses
- `validUntil` is derived from chain time in the live gateway paths
- Foundry tests cover valid, expired, and unauthorized responses for both integrations
- GitHub Actions runs typechecking, contract build, unit tests, and the full local demo
