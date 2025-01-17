// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

interface IAddrSetter {
    function setAddr(
        bytes calldata name,
        address _addr
    ) external view returns (bytes memory result);
}
