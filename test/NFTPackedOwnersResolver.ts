import { makeL2Gateway } from "@consensys/linea-ccip-gateway";
import { Server } from "@chainlink/ccip-read-server";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";
import { HardhatEthersHelpers } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import {
  BrowserProvider,
  JsonRpcProvider,
  Signer,
  ZeroAddress,
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
  NFTPackedOwnersResolver,
  RollupMock,
} from "../typechain-types";
const labelhash = (label: string) =>
  ethers.keccak256(ethers.toUtf8Bytes(label));
const encodeName = (name: string) =>
  "0x" + packet.name.encode(name).toString("hex");
const domainName = "foos";
const baseDomain = `${domainName}.eth`;
const node = ethers.namehash(baseDomain);
const encodedname = encodeName(baseDomain);

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

describe("NFT Resolver", () => {
  let l1Provider: BrowserProvider;
  let l2Provider: JsonRpcProvider;
  let l1SepoliaProvider: JsonRpcProvider;
  let signer: Signer;
  let verifier: LineaSparseProofVerifier;
  let target: NFTPackedOwnersResolver;
  let ens: ENS;
  let baseRegistrar: BaseRegistrarImplementation;
  let rollup: RollupMock;
  let signerAddress: string;
  let l2NFTContractAddress: string;
  let publicResolverAddress: string;

  before(async () => {
    // Hack to get a 'real' ethers provider from hardhat. The default `HardhatProvider`
    // doesn't support CCIP-read.
    l1Provider = new ethers.BrowserProvider(ethers.provider._hardhatProvider);
    // Those test work only with a specific contract deployed on linea sepolia
    l2Provider = new ethers.JsonRpcProvider("https://rpc.linea.build", 59144, {
      staticNetwork: true,
    });
    // We need this provider to get the latest L2BlockNumber along with the the linea state root hash
    l1SepoliaProvider = new ethers.JsonRpcProvider(
      "https://eth.llamarpc.com",
      1,
      {
        staticNetwork: true,
      }
    );
    signer = await l1Provider.getSigner(0);
    signerAddress = await signer.getAddress();
    // The NFT contract deployed on Linea Sepolia
    l2NFTContractAddress = "0xa9651e1f89535d5b6ede0b818d07712d826e5dc8";

    const Rollup = await ethers.getContractFactory("RollupMock", signer);

    // We query the latest block number and state root hash on the actual L1 sepolia chain
    // because otherwise if we hard code a block number and state root hash the test is no longer
    // working after a while as linea_getProof stops working for older blocks
    const rollupSepolia = new ethers.Contract(
      "0xd19d4B5d358258f05D7B411E21A1460D11B0876F",
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
    await publicResolver.setAddr(node, signerAddress);

    publicResolverAddress = await publicResolver.getAddress();
    await reverseRegistrar.setDefaultResolver(publicResolverAddress);

    await l1Provider.send("evm_mine", []);

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

    const LabelUtils = await ethers.getContractFactory("LabelUtils", signer);
    const labelUtils = await LabelUtils.deploy();

    const nftResolverFactory = await ethers.getContractFactory(
      "NFTPackedOwnersResolver",
      {
        libraries: { LabelUtils: await labelUtils.getAddress() },
        signer,
      }
    );
    const verifierAddress = await verifier.getAddress();
    target = await nftResolverFactory.deploy(
      verifierAddress,
      ensAddress,
      "0x0000000000000000000000000000000000000001",
      59141,
      10000
    );
    // Mine an empty block so we have something to prove against
    await l1Provider.send("evm_mine", []);
  });

  it("should resolve ETH Address for the subdomain", async () => {
    await target.setTarget(encodedname, l2NFTContractAddress);
    await target.setBaseNodeResolver(encodedname, publicResolverAddress);
    await target.setTargetAddrSlot(encodedname, 37);
    await l1Provider.send("evm_mine", []);

    for (let i = 1; i <= 10; i++) {
      const subDomain = `${i}.foos.eth`;
      const subDomainNode = ethers.namehash(subDomain);
      const encodedSubDomain = encodeName(subDomain);

      const iface = new ethers.Interface([
        "function addr(bytes32) returns(address)",
      ]);
      const calldata = iface.encodeFunctionData("addr", [subDomainNode]);
      const result2 = await target.resolve(encodedSubDomain, calldata, {
        enableCcipRead: true,
      });
      const decoded = iface.decodeFunctionResult("addr", result2);
      const address = ethers.getAddress(decoded[0]);
      console.log({ nftId: i });
      console.log({ address });
      expect(address).to.not.equal(ZeroAddress);
    }
  });
});
