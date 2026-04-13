// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    InvalidSigner,
    OffchainLookup,
    ResponseExpired
} from "../contracts/BaseSignedOffchainReader.sol";
import {SignedConfigReader} from "../contracts/SignedConfigReader.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function sign(
        uint256 privateKey,
        bytes32 digest
    ) external returns (uint8 v, bytes32 r, bytes32 s);
}

contract SignedConfigReaderTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant RESPONSE_TYPEHASH =
        keccak256(
            "Response(bytes name,bytes data,bytes result,uint64 validUntil,address resolver)"
        );

    uint256 private constant ALLOWED_SIGNER_KEY = 0xB0B;
    uint256 private constant INVALID_SIGNER_KEY = 0xBAD;

    SignedConfigReader private reader;
    address private allowedSigner;

    function setUp() public {
        allowedSigner = vm.addr(ALLOWED_SIGNER_KEY);
        reader = new SignedConfigReader(allowedSigner, "http://127.0.0.1:3000/resolve");
    }

    function testGetStringRevertsWithOffchainLookup() public {
        string memory key = "app.name";
        bytes memory request = abi.encode(key);
        bytes memory data = abi.encodeWithSelector(reader.getString.selector, key);
        string[] memory urls = new string[](1);
        urls[0] = "http://127.0.0.1:3000/resolve";
        bytes memory callData = abi.encode(request, data);

        vm.expectRevert(
            abi.encodeWithSelector(
                OffchainLookup.selector,
                address(reader),
                urls,
                callData,
                reader.getStringWithProof.selector,
                callData
            )
        );

        reader.getString(key);
    }

    function testGetStringWithProofReturnsSignedString() public {
        string memory key = "app.name";
        bytes memory request = abi.encode(key);
        bytes memory data = abi.encodeWithSelector(reader.getString.selector, key);
        bytes memory result = abi.encode("Signed Offchain Data Starter Kit");
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(request, data, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        string memory returnedValue = reader.getStringWithProof(response, abi.encode(request, data));
        require(
            keccak256(bytes(returnedValue))
                == keccak256(bytes("Signed Offchain Data Starter Kit")),
            "reader returned wrong config value"
        );
    }

    function testGetStringWithProofRevertsForWrongSigner() public {
        string memory key = "app.name";
        bytes memory request = abi.encode(key);
        bytes memory data = abi.encodeWithSelector(reader.getString.selector, key);
        bytes memory result = abi.encode("Signed Offchain Data Starter Kit");
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(request, data, result, validUntil, INVALID_SIGNER_KEY)
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                InvalidSigner.selector,
                vm.addr(INVALID_SIGNER_KEY),
                allowedSigner
            )
        );
        reader.getStringWithProof(response, abi.encode(request, data));
    }

    function testGetStringWithProofRevertsWhenExpired() public {
        string memory key = "app.name";
        bytes memory request = abi.encode(key);
        bytes memory data = abi.encodeWithSelector(reader.getString.selector, key);
        bytes memory result = abi.encode("Signed Offchain Data Starter Kit");
        uint64 validUntil = uint64(block.timestamp - 1);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(request, data, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        vm.expectRevert(
            abi.encodeWithSelector(ResponseExpired.selector, validUntil, block.timestamp)
        );
        reader.getStringWithProof(response, abi.encode(request, data));
    }

    function _signResponse(
        bytes memory request,
        bytes memory data,
        bytes memory result,
        uint64 validUntil,
        uint256 signerKey
    ) internal returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                RESPONSE_TYPEHASH,
                keccak256(request),
                keccak256(data),
                keccak256(result),
                validUntil,
                address(reader)
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", reader.domainSeparator(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
