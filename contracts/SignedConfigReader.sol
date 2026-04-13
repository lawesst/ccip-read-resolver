// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseSignedOffchainReader} from "./BaseSignedOffchainReader.sol";

/// @title SignedConfigReader
/// @notice Generic starter-kit example for signed offchain string configuration values.
/// @dev Unlike the ENS reference integration, this contract shows the same proof flow being used
///      for a non-ENS use case: app or protocol configuration fetched from a gateway.
contract SignedConfigReader is BaseSignedOffchainReader {
    constructor(address allowedSigner_, string memory gatewayURL_)
        BaseSignedOffchainReader(allowedSigner_, gatewayURL_, "SignedConfigReader")
    {}

    /// @notice Starts an offchain lookup for a configuration value.
    function getString(string calldata key) external view returns (string memory) {
        bytes memory request = abi.encode(key);
        bytes memory data = abi.encodeWithSelector(this.getString.selector, key);
        _requestOffchain(request, data, this.getStringWithProof.selector);
    }

    /// @notice Verifies the signed response and decodes the returned string.
    function getStringWithProof(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (string memory) {
        (, , bytes memory result) = _verifyResponse(response, extraData);
        return abi.decode(result, (string));
    }
}
