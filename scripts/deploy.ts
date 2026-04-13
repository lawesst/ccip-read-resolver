import "dotenv/config";

import { readFileSync } from "node:fs";

import {
  ContractFactory,
  type InterfaceAbi,
  JsonRpcProvider,
  Wallet,
  formatEther,
} from "ethers";

import {
  SEPOLIA_CHAIN_ID,
  DEFAULT_DEPLOYER_PRIVATE_KEY,
} from "../src/config.js";
import {
  assertExpectedChainId,
  getAllowedSignerAddress,
  getGatewayUrl,
  getOptionalEnv,
  getRpcUrl,
} from "../src/runtime.js";

interface FoundryArtifact {
  abi: InterfaceAbi;
  bytecode?: string | { object?: string };
}

function loadArtifact(contractName: string): FoundryArtifact {
  const artifactUrl = new URL(`../out/${contractName}.sol/${contractName}.json`, import.meta.url);

  try {
    return JSON.parse(readFileSync(artifactUrl, "utf8")) as FoundryArtifact;
  } catch {
    throw new Error(
      `Missing ${contractName} artifact. Run "npm run build" before "npm run deploy".`,
    );
  }
}

function getBytecode(artifact: FoundryArtifact): string {
  const rawBytecode =
    typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;

  if (typeof rawBytecode !== "string" || rawBytecode.length === 0) {
    throw new Error("Selected contract artifact is missing bytecode");
  }

  return rawBytecode.startsWith("0x") ? rawBytecode : `0x${rawBytecode}`;
}

const rpcUrl = getRpcUrl();
const deployerPrivateKey = getOptionalEnv("DEPLOYER_PRIVATE_KEY") ?? DEFAULT_DEPLOYER_PRIVATE_KEY;
const gatewayUrl = getGatewayUrl();
const contractName = getOptionalEnv("CONTRACT_NAME") ?? "OffchainResolver";

const provider = new JsonRpcProvider(rpcUrl);
const deployer = new Wallet(deployerPrivateKey, provider);
const allowedSignerAddress = getAllowedSignerAddress();
const artifact = loadArtifact(contractName);
const factory = new ContractFactory(artifact.abi, getBytecode(artifact), deployer);
const balanceBefore = await provider.getBalance(deployer.address);
const network = await provider.getNetwork();

assertExpectedChainId(network.chainId, SEPOLIA_CHAIN_ID, "Sepolia deployment");

const contract = await factory.deploy(allowedSignerAddress, gatewayUrl);
await contract.waitForDeployment();

const balanceAfter = await provider.getBalance(deployer.address);
const deploymentTx = contract.deploymentTransaction();

console.log(`${contractName} deployed at ${await contract.getAddress()}`);
console.log(`Network chainId: ${network.chainId.toString()}`);
console.log(`Deployer: ${deployer.address}`);
console.log(`Allowed signer: ${allowedSignerAddress}`);
console.log(`Gateway URL: ${gatewayUrl}`);
if (deploymentTx) {
  console.log(`Deployment tx: ${deploymentTx.hash}`);
}
console.log(`Deployer balance before: ${formatEther(balanceBefore)} ETH`);
console.log(`Deployer balance after: ${formatEther(balanceAfter)} ETH`);
