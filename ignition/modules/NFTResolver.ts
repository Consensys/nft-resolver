import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";

const NFTResolverModule = buildModule("NFTResolverModule", (m) => {
  const networkName = hre.network.name;
  let chainId = hre.network.config.chainId;

  let verifierAddress: string;
  let ensAddress;
  let wrapperAddress: string;
  let publicResolverAddress: string;

  switch (networkName) {
    case "sepolia":
    case "localhost":
      // WARNING if deploying on localhost you'll need to do your tests on a sepolia forked chain
      verifierAddress = "0x17289b2e80DcaB38249adb5a2Bd1a0cAF12361A0";
      ensAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
      wrapperAddress = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
      publicResolverAddress = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD";
      break;
    case "mainnet":
      verifierAddress = "0x2aD1A39a3b616FB11ac5DB290061A0A5C09771f3";
      ensAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
      wrapperAddress = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
      publicResolverAddress = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
      break;
    default:
      throw "Network not supported";
  }

  if (!chainId) {
    chainId = 31337;
  }

  const labelUtils = m.library("LabelUtils");
  const nftResolver = m.contract(
    "NFTResolver",
    [
      verifierAddress,
      ensAddress,
      wrapperAddress,
      chainId,
      publicResolverAddress,
    ],
    { libraries: { LabelUtils: labelUtils } }
  );

  return { nftResolver };
});

export default NFTResolverModule;
