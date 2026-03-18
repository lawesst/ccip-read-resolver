// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Standard CCIP-Read error from EIP-3668.
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

error ZeroAddressNotAllowed();
error EmptyGatewayURL();
error ResponseExpired(uint64 validUntil, uint256 currentTimestamp);
error InvalidSigner(address recoveredSigner, address expectedSigner);

/// @title OffchainResolver
/// @notice Minimal ENS-style CCIP-Read resolver that verifies offchain responses with EIP-712.
contract OffchainResolver {
    // ERC-165 interface IDs used by ENS-aware clients.
    //
    // - 0x01ffc9a7 is IERC165.supportsInterface(bytes4)
    // - 0x9061b923 is ENSIP-10 / IExtendedResolver.resolve(bytes,bytes)
    //
    // Advertising the extended resolver interface is what allows ENS tooling such as the
    // Universal Resolver to detect that this contract supports wildcard-style offchain
    // resolution via resolve(bytes,bytes).
    bytes4 private constant INTERFACE_ID_ERC165 = 0x01ffc9a7;
    bytes4 private constant INTERFACE_ID_IEXTENDED_RESOLVER = 0x9061b923;

    // EIP-712 domain fields. The domain binds signatures to:
    // - a human-readable protocol name
    // - a version
    // - the current chain
    // - this exact resolver contract
    //
    // That prevents a valid signature for one deployment or chain from being replayed on another.
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    // The gateway signs this exact typed struct. The message commits to:
    // - the original DNS-encoded ENS name
    // - the original resolver calldata
    // - the exact bytes returned to the client
    // - an expiry timestamp
    // - the resolver contract address
    //
    // Signing all of those fields prevents the response from being reused for a different
    // lookup, different result, different resolver, or after expiry.
    bytes32 private constant RESPONSE_TYPEHASH =
        keccak256(
            "Response(bytes name,bytes data,bytes result,uint64 validUntil,address resolver)"
        );

    bytes32 private constant NAME_HASH = keccak256("OffchainResolver");
    bytes32 private constant VERSION_HASH = keccak256("1");

    // Single trusted offchain signer. In production this is usually controlled by the gateway
    // infrastructure or a dedicated signing service.
    address public immutable allowedSigner;

    // HTTP endpoint that CCIP-Read-aware clients should query after resolve() reverts.
    string public gatewayURL;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    constructor(address allowedSigner_, string memory gatewayURL_) {
        if (allowedSigner_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        if (bytes(gatewayURL_).length == 0) {
            revert EmptyGatewayURL();
        }

        allowedSigner = allowedSigner_;
        gatewayURL = gatewayURL_;
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    /// @notice Starts a CCIP-Read lookup by reverting with OffchainLookup.
    /// @dev CCIP-Read works by intentionally reverting instead of returning data directly.
    ///      A compatible client catches this revert, calls the supplied gateway URL, then invokes
    ///      resolveWithProof() with the signed response bytes.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = gatewayURL;

        // The offchain gateway needs the original inputs so it can reproduce the resolver result
        // and sign the same payload the contract will later verify onchain.
        bytes memory callData = abi.encode(name, data);

        revert OffchainLookup(
            address(this),
            urls,
            callData, // forwarded to the gateway by the client
            this.resolveWithProof.selector,
            callData // echoed back to resolveWithProof() as extraData
        );
    }

    /// @notice Verifies the signed offchain response and returns the resolver payload.
    /// @param response ABI-encoded (bytes result, uint64 validUntil, bytes signature).
    /// @param extraData ABI-encoded (bytes name, bytes data) copied from resolve().
    function resolveWithProof(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory result) {
        (bytes memory name, bytes memory data) = abi.decode(extraData, (bytes, bytes));
        uint64 validUntil;
        bytes memory signature;
        (result, validUntil, signature) = abi.decode(response, (bytes, uint64, bytes));

        // Security check 1: reject expired responses.
        // Without this, a valid old signature could be replayed indefinitely.
        if (validUntil < block.timestamp) {
            revert ResponseExpired(validUntil, block.timestamp);
        }

        // Rebuild the exact EIP-712 struct hash the gateway signed offchain.
        //
        // EIP-712 requires dynamic bytes fields to be included as keccak256(fieldBytes).
        // The resolver address is part of the signed payload so the same signature cannot be
        // replayed against another resolver contract.
        bytes32 structHash = keccak256(
            abi.encode(
                RESPONSE_TYPEHASH,
                keccak256(name),
                keccak256(data),
                keccak256(result),
                validUntil,
                address(this)
            )
        );

        // Build the final EIP-712 digest:
        // keccak256("\x19\x01" || domainSeparator || structHash)
        //
        // The domain separator ties the signature to this resolver and chain.
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );

        // Recover the signer from the digest.
        // OpenZeppelin ECDSA rejects malformed and malleable signatures before recovery.
        address recoveredSigner = ECDSA.recover(digest, signature);

        // Security check 2: only accept signatures from the configured offchain signer.
        // Even if the message is well-formed, any other signer must be rejected.
        if (recoveredSigner != allowedSigner) {
            revert InvalidSigner(recoveredSigner, allowedSigner);
        }

        // At this point:
        // - the response is fresh
        // - the signed payload matches the original query
        // - the signer is trusted
        //
        // Returning result completes the CCIP-Read round-trip.
        return result;
    }

    /// @notice Exposes the current EIP-712 domain separator for testing and tooling.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice ERC-165 interface detection used by ENS clients and the Universal Resolver.
    /// @dev Returning the ENSIP-10 interface ID makes this contract discoverable as an
    ///      extended resolver that can answer generic resolve(bytes,bytes) lookups.
    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return
            interfaceID == INTERFACE_ID_ERC165
                || interfaceID == INTERFACE_ID_IEXTENDED_RESOLVER;
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }

        // Recompute if the chain ID changes after a fork so signatures remain domain-correct.
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }
}
