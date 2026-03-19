# CCIP-Read & Signed Offchain Data Starter Kit for Ethereum Applications

## Description

CCIP-Read & Signed Offchain Data Starter Kit for Ethereum Applications is an open-source toolkit for building contracts and gateways that serve offchain data with EIP-712 proofs and standard client-compatible request handling.

The Starter Kit is designed for Ethereum applications that need verifiable offchain reads without rebuilding signature verification, replay protection, expiry handling, and callback formatting from scratch. It packages reusable Solidity verification modules, TypeScript gateway helpers, proof-safe codecs, deployment scripts, and live reference integrations into a developer-friendly system that can be adapted across multiple use cases.

The current live implementation already proves the core model works in practice. It includes a verified Sepolia deployment, a hosted gateway, and a real ENS name resolving successfully through standard `ethers` client flows. ENS is the first live reference integration, but the Starter Kit is designed more broadly for Ethereum applications that need trusted offchain data with onchain verification.

Target use cases include:

- ENS offchain resolution
- signed metadata registries
- signed app or protocol configuration feeds
- identity and profile systems
- dynamic records stored offchain but verified onchain
- lightweight offchain data services for contracts and clients

The goal is to turn a working live implementation into reusable public-good infrastructure for Ethereum developers.

## Milestone 1

### Description

Milestone 1 focuses on packaging the current live implementation into a reusable core Starter Kit for signed offchain data verification.

This milestone covers the foundational reusable pieces: Solidity proof verification, standard callback/request handling, gateway signing logic, and support for a small initial set of query and record types. The goal is to move from a project-specific live demo to a cleaner modular base that developers can adopt for their own applications.

This is the core technical milestone. It turns the current implementation into reusable infrastructure and broadens the framing beyond ENS by establishing a general offchain proof system with reusable handlers and adapters.

### Detail of Deliverables

- refactor the current live codebase into reusable Starter Kit modules
- provide reusable Solidity modules for signed offchain data verification
- standardize EIP-712 proof verification logic
- support `text`, `addr`, and `contenthash`-style response flows
- provide handler/codecs for supported payload types
- standardize gateway request handling for client-compatible offchain reads
- expand test coverage for:
  - valid proofs
  - expired proofs
  - wrong signer failures
  - replay failures
  - payload-specific validation paths
- keep ENS as a working reference integration while structuring the core code for broader use

### Requested Funds

`1 ETH`

## Milestone 2

### Description

Milestone 2 focuses on developer adoption, documentation, and broader reference integrations.

Once the core Starter Kit is packaged, the next step is to make it straightforward for third-party developers to understand, deploy, adapt, and validate. This milestone will add integration tooling, example adapters, reference use cases beyond ENS, and a clearer public developer path for adoption.

The goal is to ensure the Starter Kit is not only technically correct, but practically usable by Ethereum developers building offchain data systems.

### Detail of Deliverables

- add deployment and integration templates for new projects
- add at least one non-ENS reference integration, such as:
  - signed configuration retrieval
  - signed metadata retrieval
- add smoke-test scripts for reference integrations
- improve documentation for:
  - deployment
  - gateway hosting
  - signer configuration
  - adapter usage
  - debugging common failures
- maintain a live Sepolia reference deployment
- keep ENS as a live reference integration
- publish an updated public release showing both ENS and non-ENS usage patterns

### Requested Funds

`1 ETH`

## Detailed Technical Specification

The Starter Kit will be structured in three major layers: onchain verification, offchain gateway infrastructure, and developer tooling.

### 1. Onchain Verification Layer

The Solidity layer will provide reusable contracts for validating signed offchain data.

Planned components:

- `BaseOffchainReader`
- `EIP712ProofVerifier`
- signer authorization module
- payload codec helpers
- optional integration-specific extensions

Core responsibilities:

- trigger offchain reads using callback-compatible patterns
- reconstruct EIP-712 digests onchain
- validate signer authorization
- reject expired proofs
- bind responses to:
  - the active chain
  - the verifying contract
  - the original request bytes
  - the exact returned result
  - a validity window

This layer will make the proof boundary explicit and reusable so application developers do not have to design proof verification logic from scratch.

### 2. Offchain Gateway Layer

The TypeScript gateway will serve and sign offchain responses.

Core responsibilities:

- accept standard client-compatible request formats
- decode request payloads into structured queries
- fetch or compute data from configured backends
- ABI-encode or otherwise normalize return values
- sign the result using EIP-712
- return the callback payload expected by the consuming contract or client

Planned modules:

- request parser
- signing service
- adapter interface
- payload encoders and decoders
- environment helpers
- deployment/runtime helpers

This gateway layer is intended to be reusable across different application types, not just ENS.

### 3. Adapter Model

To make the Starter Kit broadly useful, the gateway will use pluggable backend adapters.

Planned adapter types:

- static mapping adapter
- API-backed adapter
- database-backed adapter
- custom project adapter

This allows teams to reuse the same verification and signing infrastructure while plugging in their own backend logic.

### 4. Query / Record Handling Strategy

Rather than hiding everything behind a single dynamic interface, the Starter Kit will use explicit codec and handler modules for supported query types.

Initial support will include:

- string-based record retrieval
- address record retrieval
- contenthash-style payload retrieval
- generic signed metadata payloads
- generic configuration payloads

This explicit handler model keeps the code easier to audit, reason about, and extend safely.

### 5. Security Model

The security model will preserve the core guarantees already proven in the live implementation.

Responses will be bound to:

- chain ID
- verifying contract
- original request bytes
- exact result bytes
- expiry timestamp

Security features include:

- EIP-712 domain separation
- proof expiry
- strict signer authorization
- replay protection across requests and result payloads
- negative tests for malformed or mismatched responses

The Starter Kit will also include better operational guidance around signer rotation and deployer/signer separation.

### 6. Reference Integrations

The Starter Kit will ship with real example integrations to prove that the abstractions work in practice.

Reference integrations will include:

- ENS offchain resolution as the first live integration
- signed configuration retrieval for contracts or apps
- signed metadata retrieval as a non-ENS use case

This is important because it demonstrates that the Starter Kit is not just ENS-specific infrastructure under a new label, but genuinely reusable proof infrastructure for Ethereum applications.

### 7. Testing Strategy

Testing will run at three levels.

#### Solidity tests

- valid proof success
- expired proof rejection
- wrong signer rejection
- replay rejection
- payload-specific tests

#### Gateway / TypeScript tests

- request parsing
- payload encoding and decoding
- EIP-712 signing correctness
- callback formatting
- malformed request handling

#### Integration tests

- live deployment
- hosted gateway
- real client resolution paths
- reference integration smoke tests

The goal is to validate both correctness and interoperability.

## Previous Work and Evidence

A working public implementation already exists and demonstrates the core model in practice.

Current public artifacts:

- GitHub repository: https://github.com/lawesst/ccip-read-resolver
- Release: https://github.com/lawesst/ccip-read-resolver/releases/tag/v0.2.0
- Verified Sepolia resolver: https://sepolia.etherscan.io/address/0x596EBB34AD8A020693E596EB03472daF57aF7910#code
- Hosted gateway: https://ccip-read-resolver-2.onrender.com/resolve

Already completed:

- Solidity offchain resolver implementing `OffchainLookup`
- ENSIP-10 compatibility for `resolve(bytes,bytes)`
- EIP-712 signature verification
- hosted gateway with standard request handling
- support for `text(bytes32,string)` and `addr(bytes32)`
- real ENS name integration via `chrisfranko.eth`
- live standard `ethers` client resolution
- deployment, verification, resolver-update, and smoke-test scripts
- Foundry tests for proof correctness and replay protection

This existing implementation significantly reduces execution risk for the proposed work.

## Evidence of Deeper Expertise

The project already demonstrates deeper technical competence in exactly the areas relevant to this proposal.

### Code-level evidence

The repository includes:

- Solidity proof verification logic
- onchain `OffchainLookup` handling
- ENSIP-10 interface support
- gateway-side request decoding and response signing
- resolver update automation for a real ENS name
- smoke-test scripts that validate live client behavior

### Testing evidence

Current test coverage includes:

- valid proof success
- expired proof rejection
- wrong signer rejection
- replay rejection
- `addr` proof replay protection
- interface support validation

### Live integration evidence

Current live result:

- Name: `chrisfranko.eth`
- Resolver: `0x596EBB34AD8A020693E596EB03472daF57aF7910`
- addr: `0x5508532b027D57b020e6C0BeDB1fE19a6d6C555c`
- url: `https://resolver.demo/chrisfranko.eth/url`

This is meaningful evidence because it proves:

- the contract is deployed and verified
- the gateway is hosted publicly
- the ENS name is configured correctly
- standard clients can resolve the name successfully
