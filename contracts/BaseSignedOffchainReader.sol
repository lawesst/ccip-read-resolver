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
error EmptyDomainName();
error ResponseExpired(uint64 validUntil, uint256 currentTimestamp);
error InvalidSigner(address recoveredSigner, address expectedSigner);

/// @title BaseSignedOffchainReader
/// @notice Shared EIP-3668 + EIP-712 verification logic for signed offchain reads.
/// @dev This base contract is intentionally generic:
///      - `request` is the primary offchain lookup input
///      - `data` is the application-specific calldata or query payload
///      Concrete integrations decide what those two bytes blobs mean.
abstract contract BaseSignedOffchainReader {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    // The starter kit keeps the original field names so the ENS reference integration remains
    // wire-compatible with the live deployment. Non-ENS integrations can treat `name` and `data`
    // as generic request-scoping bytes.
    bytes32 private constant RESPONSE_TYPEHASH =
        keccak256(
            "Response(bytes name,bytes data,bytes result,uint64 validUntil,address resolver)"
        );

    bytes32 private constant VERSION_HASH = keccak256("1");

    address public immutable allowedSigner;
    string public gatewayURL;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;
    bytes32 private immutable _nameHash;

    constructor(
        address allowedSigner_,
        string memory gatewayURL_,
        string memory domainName_
    ) {
        if (allowedSigner_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        if (bytes(gatewayURL_).length == 0) {
            revert EmptyGatewayURL();
        }
        if (bytes(domainName_).length == 0) {
            revert EmptyDomainName();
        }

        allowedSigner = allowedSigner_;
        gatewayURL = gatewayURL_;
        _nameHash = keccak256(bytes(domainName_));
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    /// @notice Exposes the current EIP-712 domain separator for testing and tooling.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @dev Reverts with OffchainLookup so an offchain gateway can answer the read request.
    function _requestOffchain(
        bytes memory request,
        bytes memory data,
        bytes4 callbackFunction
    ) internal view {
        string[] memory urls = new string[](1);
        urls[0] = gatewayURL;

        bytes memory callData = abi.encode(request, data);

        revert OffchainLookup(
            address(this),
            urls,
            callData,
            callbackFunction,
            callData
        );
    }

    /// @dev Verifies a signed gateway response and returns the decoded request, calldata, and
    ///      result bytes to the concrete integration.
    function _verifyResponse(
        bytes calldata response,
        bytes calldata extraData
    )
        internal
        view
        returns (bytes memory request, bytes memory data, bytes memory result)
    {
        (request, data) = abi.decode(extraData, (bytes, bytes));
        uint64 validUntil;
        bytes memory signature;
        (result, validUntil, signature) = abi.decode(response, (bytes, uint64, bytes));

        if (validUntil < block.timestamp) {
            revert ResponseExpired(validUntil, block.timestamp);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                RESPONSE_TYPEHASH,
                keccak256(request),
                keccak256(data),
                keccak256(result),
                validUntil,
                address(this)
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );

        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != allowedSigner) {
            revert InvalidSigner(recoveredSigner, allowedSigner);
        }
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }

        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                _nameHash,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }
}
