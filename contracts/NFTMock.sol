pragma solidity 0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTMock is ERC721 {
    uint256 public currentTokenId;

    constructor() ERC721("Test", "TST") {
        currentTokenId = 1;
    }

    function mint() external {
        _safeMint(msg.sender, currentTokenId);
        currentTokenId++;
    }
}
