import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";

const NFTResolverModule = buildModule("NFTResolverModule", (m) => {
  const networkName = hre.network.name;
  console.log(networkName);
  // TODO: FIll in module info
});

export default NFTResolverModule;
