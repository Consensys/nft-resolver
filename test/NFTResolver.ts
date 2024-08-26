import { makeL2Gateway } from "@consensys/linea-ccip-gateway";
import { Server } from "@chainlink/ccip-read-server";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { HardhatEthersHelpers } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  Signer,
  ethers as ethersT,
} from "ethers";
import { FetchRequest } from "ethers";
import { ethers } from "hardhat";
import { EthereumProvider } from "hardhat/types";
import request from "supertest";
import packet from "dns-packet";
import {
  BaseRegistrarImplementation,
  ENS,
  LineaSparseProofVerifier,
  NFTResolver,
  RollupMock,
} from "../typechain-types";
const labelhash = (label: string) =>
  ethers.keccak256(ethers.toUtf8Bytes(label));
const encodeName = (name: string) =>
  "0x" + packet.name.encode(name).toString("hex");
const nftId = 1;
const wrongNftId = 0;
const domainName = "foos";
const baseDomain = `${domainName}.eth`;
const node = ethers.namehash(baseDomain);
const encodedname = encodeName(baseDomain);

const registrantAddr = "0x4a8e79E5258592f208ddba8A8a0d3ffEB051B10A";
const subDomain = "foo1.foos.eth";
const subDomainNode = ethers.namehash(subDomain);
const encodedSubDomain = encodeName(subDomain);

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const EMPTY_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

type ethersObj = typeof ethersT &
  Omit<HardhatEthersHelpers, "provider"> & {
    provider: Omit<HardhatEthersProvider, "_hardhatProvider"> & {
      _hardhatProvider: EthereumProvider;
    };
  };

declare module "hardhat/types/runtime" {
  const ethers: ethersObj;
  interface HardhatRuntimeEnvironment {
    ethers: ethersObj;
  }
}

describe("Crosschain Resolver", () => {
  let l1Provider: BrowserProvider;
  let l2Provider: JsonRpcProvider;
  let l1SepoliaProvider: JsonRpcProvider;
  let signer: Signer;
  let verifier: LineaSparseProofVerifier;
  let target: NFTResolver;
  let l2NFTContract: Contract;
  let ens: ENS;
  let baseRegistrar: BaseRegistrarImplementation;
  let rollup: RollupMock;
  let signerAddress: string;
  let l2NFTContractAddress: string;

  before(async () => {
    // Hack to get a 'real' ethers provider from hardhat. The default `HardhatProvider`
    // doesn't support CCIP-read.
    l1Provider = new ethers.BrowserProvider(ethers.provider._hardhatProvider);
    // Those test work only with a specific contract deployed on linea sepolia
    l2Provider = new ethers.JsonRpcProvider(
      "https://rpc.sepolia.linea.build/",
      59140,
      {
        staticNetwork: true,
      }
    );
    // We need this provider to get the latest L2BlockNumber along with the the linea state root hash
    l1SepoliaProvider = new ethers.JsonRpcProvider(
      "https://gateway.tenderly.co/public/sepolia",
      11155111,
      {
        staticNetwork: true,
      }
    );
    signer = await l1Provider.getSigner(0);
    signerAddress = await signer.getAddress();
    // The NFT contract deployed on Linea Sepolia
    l2NFTContractAddress = "0x27c11E7d60bA46a55EBF1fA33E6c30eDeAb162B6";

    const Rollup = await ethers.getContractFactory("RollupMock", signer);

    // We query the latest block number and state root hash on the actual L1 sepolia chain
    // because otherwise if we hard code a block number and state root hash the test is no longer
    // working after a while as linea_getProof stops working for older blocks
    const rollupSepolia = new ethers.Contract(
      "0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5",
      Rollup.interface,
      l1SepoliaProvider
    );
    const currentL2BlockNumber = await rollupSepolia.currentL2BlockNumber();
    const stateRootHash = await rollupSepolia.stateRootHashes(
      currentL2BlockNumber
    );
    rollup = await Rollup.deploy(currentL2BlockNumber, stateRootHash);

    const gateway = makeL2Gateway(
      l1Provider as unknown as JsonRpcProvider,
      l2Provider,
      await rollup.getAddress()
    );
    const server = new Server();
    gateway.add(server);
    const app = server.makeApp("/");
    const getUrl = FetchRequest.createGetUrlFunc();
    ethers.FetchRequest.registerGetUrl(async (req: FetchRequest) => {
      if (req.url != "test:") return getUrl(req);

      const r = request(app).post("/");
      if (req.hasBody()) {
        r.set("Content-Type", "application/json").send(
          ethers.toUtf8String(req.body)
        );
      }
      const response = await r;
      return {
        statusCode: response.statusCode,
        statusMessage: response.ok ? "OK" : response.statusCode.toString(),
        body: ethers.toUtf8Bytes(JSON.stringify(response.body)),
        headers: {
          "Content-Type": "application/json",
        },
      };
    });
    const ensFactory = await ethers.getContractFactory("ENSRegistry", signer);
    ens = await ensFactory.deploy();
    const ensAddress = await ens.getAddress();
    const baseRegistrarFactory = await ethers.getContractFactory(
      "BaseRegistrarImplementation",
      signer
    );
    baseRegistrar = await baseRegistrarFactory.deploy(
      ensAddress,
      ethers.namehash("eth")
    );
    const baseRegistrarAddress = await baseRegistrar.getAddress();
    await baseRegistrar.addController(signerAddress);

    const reverseRegistrarFactory = await ethers.getContractFactory(
      "ReverseRegistrar",
      signer
    );
    const reverseRegistrar = await reverseRegistrarFactory.deploy(ensAddress);
    const reverseRegistrarAddress = await reverseRegistrar.getAddress();
    await ens.setSubnodeOwner(
      EMPTY_BYTES32,
      labelhash("reverse"),
      signerAddress
    );
    await ens.setSubnodeOwner(
      ethers.namehash("reverse"),
      labelhash("addr"),
      reverseRegistrarAddress
    );
    await ens.setSubnodeOwner(
      EMPTY_BYTES32,
      labelhash("eth"),
      baseRegistrarAddress
    );

    await baseRegistrar.register(
      labelhash(domainName),
      signerAddress,
      100000000
    );
    const publicResolverFactory = await ethers.getContractFactory(
      "PublicResolver",
      signer
    );

    const publicResolver = await publicResolverFactory.deploy(
      ensAddress,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
      reverseRegistrarAddress
    );

    const publicResolverAddress = await publicResolver.getAddress();
    await reverseRegistrar.setDefaultResolver(publicResolverAddress);

    console.log("TEST1");
    await l1Provider.send("evm_mine", []);
    console.log("TEST2");

    const Mimc = await ethers.getContractFactory("Mimc", signer);
    const mimc = await Mimc.deploy();

    const SparseMerkleProof = await ethers.getContractFactory(
      "SparseMerkleProof",
      { libraries: { Mimc: await mimc.getAddress() }, signer }
    );
    const sparseMerkleProof = await SparseMerkleProof.deploy();

    const verifierFactory = await ethers.getContractFactory(
      "LineaSparseProofVerifier",
      {
        libraries: {
          SparseMerkleProof: await sparseMerkleProof.getAddress(),
        },
        signer,
      }
    );
    verifier = await verifierFactory.deploy(
      ["test:"],
      await rollup.getAddress()
    );

    const nftResolverFactory = await ethers.getContractFactory(
      "NFTResolver",
      signer
    );
    const verifierAddress = await verifier.getAddress();
    target = await nftResolverFactory.deploy(
      verifierAddress,
      ensAddress,
      "0x0000000000000000000000000000000000000001",
      59141
    );
    // Mine an empty block so we have something to prove against
    await l1Provider.send("evm_mine", []);
    const erc721Factory = await ethers.getContractFactory("ERC721");
    l2NFTContract = new ethers.Contract(
      l2NFTContractAddress,
      erc721Factory.interface,
      l2Provider
    );
  });

  it("should not allow non owner to set target", async () => {
    const incorrectname = encodeName("notowned.eth");
    try {
      await target.setTarget(incorrectname, l2NFTContractAddress);
      throw "Should have reverted";
    } catch (e: any) {
      console.log(e);
      expect(e.reason).equal("Not authorized to set target for this node");
    }

    const result = await target.getTarget(incorrectname);
    expect(result[1]).to.equal(EMPTY_ADDRESS);
  });

  it("should allow owner to set target", async () => {
    await target.setTarget(encodedname, signerAddress);
    const result = await target.getTarget(encodeName(baseDomain));
    expect(result[1]).to.equal(signerAddress);
  });

  it("subname should get target of its parent", async () => {
    await target.setTarget(encodedname, signerAddress);
    const result = await target.getTarget(encodedSubDomain);
    expect(result[0]).to.equal(subDomainNode);
    expect(result[1]).to.equal(signerAddress);
  });

  it("should resolve empty ETH Address", async () => {
    await target.setTarget(encodedname, l2NFTContractAddress);
    const addr = "0x0000000000000000000000000000000000000000";
    const i = new ethers.Interface(["function addr(bytes32) returns(address)"]);
    const calldata = i.encodeFunctionData("addr", [node]);
    const result2 = await target.resolve(encodedname, calldata, {
      enableCcipRead: true,
    });
    const decoded = i.decodeFunctionResult("addr", result2);
    expect(decoded[0]).to.equal(addr);
  });

  it("should resolve ETH Address", async () => {
    await target.setTarget(encodedname, l2NFTContractAddress);
    const result = await l2NFTContract["addr(bytes32)"](subDomainNode);
    expect(ethers.getAddress(result)).to.equal(registrantAddr);
    await l1Provider.send("evm_mine", []);

    const i = new ethers.Interface(["function addr(bytes32) returns(address)"]);
    const calldata = i.encodeFunctionData("addr", [subDomainNode]);
    const result2 = await target.resolve(encodedSubDomain, calldata, {
      enableCcipRead: true,
    });
    const decoded = i.decodeFunctionResult("addr", result2);
    expect(ethers.getAddress(decoded[0])).to.equal(
      ethers.getAddress(registrantAddr)
    );
  });

  it("should revert when the functions's selector is invalid", async () => {
    await target.setTarget(encodedname, l2NFTContractAddress);
    const addr = "0x0000000000000000000000000000000000000000";
    const result = await l2NFTContract["addr(bytes32)"](node);
    expect(result).to.equal(addr);
    await l1Provider.send("evm_mine", []);
    const i = new ethers.Interface([
      "function unknown(bytes32) returns(address)",
    ]);
    const calldata = i.encodeFunctionData("unknown", [node]);
    try {
      await target.resolve(encodedname, calldata, {
        enableCcipRead: true,
      });
      throw "Should have reverted";
    } catch (error: any) {
      expect(error.reason).to.equal("invalid selector");
    }
  });

  it("should revert if the calldata is too short", async () => {
    await target.setTarget(encodedname, l2NFTContractAddress);
    const addr = "0x0000000000000000000000000000000000000000";
    const result = await l2NFTContract["addr(bytes32)"](node);
    expect(result).to.equal(addr);
    await l1Provider.send("evm_mine", []);
    const i = new ethers.Interface(["function addr(bytes32) returns(address)"]);
    const calldata = "0x";
    try {
      await target.resolve(encodedname, calldata, {
        enableCcipRead: true,
      });
      throw "Should have reverted";
    } catch (error: any) {
      expect(error.reason).to.equal("param data too short");
    }
  });
});
