// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseSignedOffchainReader} from "./BaseSignedOffchainReader.sol";

/// @title OffchainResolver
/// @notice ENS reference integration built on the reusable signed offchain reader base.
contract OffchainResolver is BaseSignedOffchainReader {
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

    constructor(address allowedSigner_, string memory gatewayURL_)
        BaseSignedOffchainReader(allowedSigner_, gatewayURL_, "OffchainResolver")
    {}

    /// @notice Starts a CCIP-Read lookup by reverting with OffchainLookup.
    /// @dev CCIP-Read works by intentionally reverting instead of returning data directly.
    ///      A compatible client catches this revert, calls the supplied gateway URL, then invokes
    ///      resolveWithProof() with the signed response bytes.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        // For ENS, `name` is the DNS-encoded name and `data` is the resolver calldata.
        _requestOffchain(name, data, this.resolveWithProof.selector);
    }

    /// @notice Verifies the signed offchain response and returns the resolver payload.
    /// @param response ABI-encoded (bytes result, uint64 validUntil, bytes signature).
    /// @param extraData ABI-encoded (bytes name, bytes data) copied from resolve().
    function resolveWithProof(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory result) {
        (, , result) = _verifyResponse(response, extraData);
        return result;
    }

    /// @notice ERC-165 interface detection used by ENS clients and the Universal Resolver.
    /// @dev Returning the ENSIP-10 interface ID makes this contract discoverable as an
    ///      extended resolver that can answer generic resolve(bytes,bytes) lookups.
    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return
            interfaceID == INTERFACE_ID_ERC165
                || interfaceID == INTERFACE_ID_IEXTENDED_RESOLVER;
    }
}
