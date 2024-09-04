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
    // The targeted NFT contract on L2
    mapping(bytes32 => address) targets;
    // The resolver for the base nodes(if any)
    mapping(bytes32 => address) baseNodeResolvers;
    // The owner slots in target contract containing the addresses to resolve to
    mapping(address => uint256) targetAddrSlots;
    // To check how old is the value/proof returned and is in the acceptable range
    uint256 constant ACCEPTED_L2_BLOCK_RANGE_LENGTH = 86400;

    event TargetSet(bytes name, address target);
    event BaseNodeResolverSet(bytes32 node, address resolverAddr);
    event TargetAddrSlotSet(address target, uint256 slot);

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
     * @param _verifier     The chain verifier address.
     * @param _ens          The ENS registry address.
     * @param _nameWrapper  The ENS name wrapper address.
     * @param _l2ChainId    The chainId at which the resolver resolves data from.
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
     * Set target address to verify against.
     * @param name The DNS encoded name to set the target for.
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
     * Set base node resolver address.
     * @param name The DNS encoded name to set the base node resolver.
     * @param resolverAddr The resolver address to use.
     */
    function setBaseNodeResolver(
        bytes calldata name,
        address resolverAddr
    ) external {
        (bytes32 node, ) = getTarget(name);
        require(
            isAuthorised(node),
            "Not authorized to set resolver for this node"
        );
        baseNodeResolvers[node] = resolverAddr;
        emit BaseNodeResolverSet(node, resolverAddr);
    }

    /**
     * Set the slot to query by ccip to get the address from the target contract.
     * @param name The DNS encoded name to set the target address slot to query.
     * @param slot The slot to set.
     */
    function setTargetAddrSlot(bytes calldata name, uint256 slot) external {
        (bytes32 node, ) = getTarget(name);
        require(
            isAuthorised(node),
            "Not authorized to set target address slot for this node"
        );
        address target = targets[node];
        targetAddrSlots[target] = slot;
        emit TargetAddrSlotSet(target, slot);
    }

    /**
     * @dev Returns the L2 target address that can answer queries for `name`.
     * @param name DNS encoded ENS name to query.
     * @return node The node of the name.
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
     * @param name DNS encoded ENS name to query.
     * @param data The actual calldata.
     * @return result Result of the call.
     */
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result) {
        require(data.length >= 4, "param data too short");

        bytes32 node = abi.decode(data[4:], (bytes32));
        bool isBaseDomain = targets[node] != address(0);

        // If trying to resolve the base domain, we use the PublicResolver
        if (isBaseDomain) {
            address baseNodeResolver = baseNodeResolvers[node];
            return _resolve(baseNodeResolver, data);
        }

        // Only accept 1 level subdomain
        require(LabelUtils.countLabels(name) <= 3, "Too many subdomain levels");

        (, address target) = _getTarget(name, 0);

        bytes4 selector = bytes4(data);

        if (selector == IAddrResolver.addr.selector) {
            // Get NFT Index from the DNS encoded name
            uint256 nftId = extractNFTId(name);
            uint256 slot = targetAddrSlots[target];
            return _addr(nftId, slot, target);
        }

        // None selector has been found it reverts
        revert("invalid selector");
    }

    /**
     * Get the NFT Id from the ENS name's label.
     * @param name DNS encoded ENS name.
     * @return id The NFT id.
     */
    function extractNFTId(bytes calldata name) public pure returns (uint256) {
        bytes memory firstLabel = LabelUtils.extractFirstLabel(name);
        // Only accept numbers as the label
        require(LabelUtils.isNumber(firstLabel), "Label is not a number");
        return LabelUtils.extractNumericSuffix(firstLabel);
    }

    /**
     * @dev Resolve and throws an EIP 3559 compliant error.
     * @param name DNS encoded ENS name to query.
     * @param _addr The actual calldata.
     * @return result Result of the call.
     */
    function setAddr(
        bytes calldata name,
        address _addr
    ) external view returns (bytes memory result) {
        (, address target) = _getTarget(name, 0);
        _writeDeferral(target);
    }

    /**
     * @dev The `PublicResolver` does not implement the `resolve(bytes,bytes)` method.
     *     This method completes the resolution request by staticcalling `PublicResolver` with the resolve request.
     *     Implementation matches the ENS `ExtendedResolver:resolve(bytes,bytes)` method with the exception that it `staticcall`s the
     *     the `rootResolver` instead of `address(this)`.
     * @param data The ABI encoded data for the underlying resolution function (Eg, addr(bytes32), text(bytes32,string), etc).
     * @return The return data, ABI encoded identically to the underlying function.
     */
    function _resolve(
        address baseNodeResolver,
        bytes memory data
    ) internal view returns (bytes memory) {
        (bool success, bytes memory result) = baseNodeResolver.staticcall(data);
        if (success) {
            return result;
        } else {
            // Revert with the reason provided by the call
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
    }

    function _addr(
        uint256 tokenId,
        uint256 slot,
        address target
    ) private view returns (bytes memory) {
        EVMFetcher
            .newFetchRequest(verifier, target)
            .getStatic(slot)
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
