// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    InvalidSigner,
    OffchainLookup,
    OffchainResolver,
    ResponseExpired
} from "../contracts/OffchainResolver.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function sign(
        uint256 privateKey,
        bytes32 digest
    ) external returns (uint8 v, bytes32 r, bytes32 s);
}

contract OffchainResolverTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes4 private constant INTERFACE_ID_ERC165 = 0x01ffc9a7;
    bytes4 private constant INTERFACE_ID_IEXTENDED_RESOLVER = 0x9061b923;
    bytes4 private constant ADDR_SELECTOR = 0x3b3b57de;

    bytes32 private constant RESPONSE_TYPEHASH =
        keccak256(
            "Response(bytes name,bytes data,bytes result,uint64 validUntil,address resolver)"
        );

    uint256 private constant ALLOWED_SIGNER_KEY = 0xB0B;
    uint256 private constant INVALID_SIGNER_KEY = 0xBAD;

    OffchainResolver private resolver;
    address private allowedSigner;

    function setUp() public {
        allowedSigner = vm.addr(ALLOWED_SIGNER_KEY);
        resolver = new OffchainResolver(allowedSigner, "http://127.0.0.1:3000/resolve");
    }

    function testResolveRevertsWithOffchainLookup() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes memory data = hex"12345678";
        string[] memory urls = new string[](1);
        urls[0] = "http://127.0.0.1:3000/resolve";
        bytes memory callData = abi.encode(name, data);

        vm.expectRevert(
            abi.encodeWithSelector(
                OffchainLookup.selector,
                address(resolver),
                urls,
                callData,
                resolver.resolveWithProof.selector,
                callData
            )
        );

        resolver.resolve(name, data);
    }

    function testResolveWithProofReturnsSignedResult() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes memory data = hex"12345678";
        bytes memory result = hex"abcdef";
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(name, data, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        bytes memory returnedResult = resolver.resolveWithProof(response, abi.encode(name, data));
        require(keccak256(returnedResult) == keccak256(result), "resolver returned wrong bytes");
    }

    function testResolveWithProofRevertsWhenExpired() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes memory data = hex"12345678";
        bytes memory result = hex"abcdef";
        uint64 validUntil = uint64(block.timestamp - 1);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(name, data, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        vm.expectRevert(
            abi.encodeWithSelector(ResponseExpired.selector, validUntil, block.timestamp)
        );
        resolver.resolveWithProof(response, abi.encode(name, data));
    }

    function testResolveWithProofRevertsForWrongSigner() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes memory data = hex"12345678";
        bytes memory result = hex"abcdef";
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(name, data, result, validUntil, INVALID_SIGNER_KEY)
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                InvalidSigner.selector,
                vm.addr(INVALID_SIGNER_KEY),
                allowedSigner
            )
        );
        resolver.resolveWithProof(response, abi.encode(name, data));
    }

    function testResolveWithProofReturnsSignedAddrResult() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes32 node = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("eth")))),
                keccak256(bytes("alice"))
            )
        );
        bytes memory data = abi.encodeWithSelector(ADDR_SELECTOR, node);
        address expectedAddress = vm.addr(ALLOWED_SIGNER_KEY);
        bytes memory result = abi.encode(expectedAddress);
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(name, data, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        bytes memory returnedResult = resolver.resolveWithProof(response, abi.encode(name, data));
        require(abi.decode(returnedResult, (address)) == expectedAddress, "resolver returned wrong addr");
    }

    function testResolveWithProofRevertsWhenAddrProofIsReplayedForDifferentNode() public {
        bytes memory name = hex"05616c6963650365746800";
        bytes32 aliceNode = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("eth")))),
                keccak256(bytes("alice"))
            )
        );
        bytes32 bobNode = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("eth")))),
                keccak256(bytes("bob"))
            )
        );
        bytes memory signedData = abi.encodeWithSelector(ADDR_SELECTOR, aliceNode);
        bytes memory replayedData = abi.encodeWithSelector(ADDR_SELECTOR, bobNode);
        bytes memory result = abi.encode(vm.addr(ALLOWED_SIGNER_KEY));
        uint64 validUntil = uint64(block.timestamp + 600);

        bytes memory response = abi.encode(
            result,
            validUntil,
            _signResponse(name, signedData, result, validUntil, ALLOWED_SIGNER_KEY)
        );

        (bool ok, bytes memory revertData) = address(resolver).staticcall(
            abi.encodeCall(resolver.resolveWithProof, (response, abi.encode(name, replayedData)))
        );

        require(!ok, "replayed addr proof should revert");
        require(_revertSelector(revertData) == InvalidSigner.selector, "expected InvalidSigner");
    }

    function testSupportsInterfaceForErc165() public view {
        require(
            resolver.supportsInterface(INTERFACE_ID_ERC165),
            "resolver should advertise ERC165"
        );
    }

    function testSupportsInterfaceForExtendedResolver() public view {
        require(
            resolver.supportsInterface(INTERFACE_ID_IEXTENDED_RESOLVER),
            "resolver should advertise ENSIP-10"
        );
    }

    function _signResponse(
        bytes memory name,
        bytes memory data,
        bytes memory result,
        uint64 validUntil,
        uint256 signerKey
    ) internal returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                RESPONSE_TYPEHASH,
                keccak256(name),
                keccak256(data),
                keccak256(result),
                validUntil,
                address(resolver)
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", resolver.domainSeparator(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _revertSelector(bytes memory revertData) internal pure returns (bytes4 selector) {
        require(revertData.length >= 4, "revert data too short");
        assembly {
            selector := mload(add(revertData, 32))
        }
    }
}
