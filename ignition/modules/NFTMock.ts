import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NFTMockModule = buildModule("NFTResolverModule", (m) => {
  const nftMock = m.contract("NFTMock", []);

  m.call(nftMock, "mint", []);

  return { nftMock };
});

export default NFTMockModule;
