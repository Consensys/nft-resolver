// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.25;

import {EVMFetcher} from "@consensys/linea-state-verifier/contracts/EVMFetcher.sol";
import {EVMFetchTarget} from "@consensys/linea-state-verifier/contracts/EVMFetchTarget.sol";
import {IEVMVerifier} from "@consensys/linea-state-verifier/contracts/IEVMVerifier.sol";
import "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {INameWrapper} from "@ensdomains/ens-contracts/contracts/wrapper/INameWrapper.sol";
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";
import {IAddrResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddressResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import {ITargetResolver} from "./ITargetResolver.sol";
import {IAddrSetter} from "./IAddrSetter.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {LabelUtils} from "./LabelUtils.sol";

contract NFTResolver is
    EVMFetchTarget,
    ITargetResolver,
    IExtendedResolver,
    IAddrSetter,
    ERC165
{
    using EVMFetcher for EVMFetcher.EVMFetchRequest;
    using BytesUtils for bytes;
    IEVMVerifier public immutable verifier;
    ENS public immutable ens;
    INameWrapper public immutable nameWrapper;
    uint256 public immutable l2ChainId;
    mapping(bytes32 => address) targets;
    uint256 constant OWNERS_SLOT = 2;
    // To check how old is the value/proof returned and is in the acceptable range
    uint256 constant ACCEPTED_L2_BLOCK_RANGE_LENGTH = 86400;

    event TargetSet(bytes name, address target);

    function isAuthorised(bytes32 node) internal view returns (bool) {
        address owner = ens.owner(node);
        if (owner == address(nameWrapper)) {
            owner = nameWrapper.ownerOf(uint256(node));
        }
        return owner == msg.sender;
    }

    /**
     * @dev EIP-5559 - Error to raise when mutations are being deferred to an L2.
     * @param chainId Chain ID to perform the deferred mutation to.
     * @param contractAddress Contract Address at which the deferred mutation should transact with.
     */
    error StorageHandledByL2(uint256 chainId, address contractAddress);

    /**
     * @param _verifier     The chain verifier address
     * @param _ens          The ENS registry address
     * @param _nameWrapper  The ENS name wrapper address
     * @param _l2ChainId    The chainId at which the resolver resolves data from
     */
    constructor(
        IEVMVerifier _verifier,
        ENS _ens,
        INameWrapper _nameWrapper,
        uint256 _l2ChainId
    ) {
        require(
            address(_nameWrapper) != address(0),
            "Name Wrapper address must be set"
        );
        require(
            address(_verifier) != address(0),
            "Verifier address must be set"
        );
        require(address(_ens) != address(0), "Registry address must be set");
        verifier = _verifier;
        ens = _ens;
        nameWrapper = _nameWrapper;
        l2ChainId = _l2ChainId;
    }

    /**
     * @dev inherits from EVMFetchTarget
     */
    function getAcceptedL2BlockRangeLength()
        public
        pure
        override
        returns (uint256)
    {
        return ACCEPTED_L2_BLOCK_RANGE_LENGTH;
    }

    /**
     * Set target address to verify against
     * @param name The encoded name to query.
     * @param target The L2 resolver address to verify against.
     */
    function setTarget(bytes calldata name, address target) external {
        (bytes32 node, ) = getTarget(name);
        require(
            isAuthorised(node),
            "Not authorized to set target for this node"
        );
        targets[node] = target;
        emit TargetSet(name, target);
    }

    /**
     * @dev Returns the L2 target address that can answer queries for `name`.
     * @param name DNS encoded ENS name to query
     * @return node The node of the name
     * @return target The L2 resolver address to verify against.
     */
    function getTarget(
        bytes memory name
    ) public view returns (bytes32 node, address target) {
        return _getTarget(name, 0);
    }

    function _getTarget(
        bytes memory name,
        uint256 offset
    ) private view returns (bytes32 node, address target) {
        uint256 len = name.readUint8(offset);
        node = bytes32(0);
        if (len > 0) {
            bytes32 label = name.keccak(offset + 1, len);
            (node, target) = _getTarget(name, offset + len + 1);
            node = keccak256(abi.encodePacked(node, label));
            if (targets[node] != address(0)) {
                return (node, targets[node]);
            }
        } else {
            return (bytes32(0), address(0));
        }
        return (node, target);
    }

    /**
     * @dev Resolve and verify a record stored in l2 target address. It supports subname by fetching target recursively to the nearest parent.
     * @param name DNS encoded ENS name to query
     * @param data The actual calldata
     * @return result result of the call
     */
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result) {
        require(data.length >= 4, "param data too short");

        bytes32 node = abi.decode(data[4:], (bytes32));
        bool isBaseDomain = targets[node] != address(0);

        // If trying to resolve the base domain, we return the target contract as the address
        if (isBaseDomain) {
            return abi.encode(targets[node]);
        }

        (, address target) = _getTarget(name, 0);

        bytes4 selector = bytes4(data);

        if (selector == IAddrResolver.addr.selector) {
            // Get NFT Index from the
            uint256 nftId = extractNFTId(name);
            return _addr(nftId, target);
        }

        // None selector has been found it reverts
        revert("invalid selector");
    }

    /**
     * Get the NFT Id from the ENS name's label
     * @param name DNS encoded ENS name
     * @return id the NFT id
     */
    function extractNFTId(bytes calldata name) public pure returns (uint256) {
        bytes memory firstLabel = LabelUtils.extractFirstLabel(name);
        return LabelUtils.extractNumericSuffix(firstLabel);
    }

    /**
     * @dev Resolve and throws an EIP 3559 compliant error
     * @param name DNS encoded ENS name to query
     * @param _addr The actual calldata
     * @return result result of the call
     */
    function setAddr(
        bytes calldata name,
        address _addr
    ) external view returns (bytes memory result) {
        (, address target) = _getTarget(name, 0);
        _writeDeferral(target);
    }

    function _addr(
        uint256 tokenId,
        address target
    ) private view returns (bytes memory) {
        EVMFetcher
            .newFetchRequest(verifier, target)
            .getStatic(OWNERS_SLOT)
            .element(tokenId)
            .fetch(this.addrCallback.selector, ""); // recordVersions
    }

    function addrCallback(
        bytes[] memory values,
        bytes memory
    ) external pure returns (bytes memory) {
        address addr = abi.decode(values[0], (address));
        return abi.encode(addr);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            interfaceId == type(ITargetResolver).interfaceId ||
            interfaceId == type(IAddrSetter).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _writeDeferral(address target) internal view {
        revert StorageHandledByL2(l2ChainId, target);
    }
}
