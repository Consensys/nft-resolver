import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";

const NFTPackedOwnersResolverModule = buildModule(
  "NFTPackedOwnersResolverModule",
  (m) => {
    const networkName = hre.network.name;
    let chainId = hre.network.config.chainId;

    let verifierAddress: string;
    let ensAddress;
    let wrapperAddress: string;

    const maxNFTId = 10000;

    switch (networkName) {
      case "sepolia":
      case "localhost":
        // WARNING if deploying on localhost you'll need to do your tests on a sepolia forked chain
        verifierAddress = "0x17289b2e80DcaB38249adb5a2Bd1a0cAF12361A0";
        ensAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
        wrapperAddress = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
        break;
      case "mainnet":
        verifierAddress = "0x2aD1A39a3b616FB11ac5DB290061A0A5C09771f3";
        ensAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
        wrapperAddress = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
        break;
      default:
        throw "Network not supported";
    }

    if (!chainId) {
      chainId = 31337;
    }

    const labelUtils = m.library("LabelUtils");
    const nftResolver = m.contract(
      "NFTPackedOwnersResolver",
      [verifierAddress, ensAddress, wrapperAddress, chainId, maxNFTId],
      { libraries: { LabelUtils: labelUtils } }
    );

    return { nftResolver };
  }
);

export default NFTPackedOwnersResolverModule;
