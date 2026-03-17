import { readFileSync } from "node:fs";

import { ContractFactory, type InterfaceAbi, JsonRpcProvider, Wallet } from "ethers";

import {
  DEFAULT_ANVIL_RPC_URL,
  DEFAULT_DEPLOYER_PRIVATE_KEY,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNER_PRIVATE_KEY,
} from "../src/config.js";

interface FoundryArtifact {
  abi: InterfaceAbi;
  bytecode?: string | { object?: string };
}

function loadResolverArtifact(): FoundryArtifact {
  const artifactUrl = new URL(
    "../out/OffchainResolver.sol/OffchainResolver.json",
    import.meta.url,
  );

  try {
    return JSON.parse(readFileSync(artifactUrl, "utf8")) as FoundryArtifact;
  } catch {
    throw new Error('Missing Foundry artifact. Run "npm run build" before "npm run deploy".');
  }
}

function getBytecode(artifact: FoundryArtifact): string {
  const rawBytecode =
    typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;

  if (typeof rawBytecode !== "string" || rawBytecode.length === 0) {
    throw new Error("OffchainResolver artifact is missing bytecode");
  }

  return rawBytecode.startsWith("0x") ? rawBytecode : `0x${rawBytecode}`;
}

const rpcUrl = process.env.RPC_URL ?? DEFAULT_ANVIL_RPC_URL;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY ?? DEFAULT_DEPLOYER_PRIVATE_KEY;
const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY ?? DEFAULT_SIGNER_PRIVATE_KEY;
const gatewayUrl = process.env.GATEWAY_URL ?? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/resolve`;

const provider = new JsonRpcProvider(rpcUrl);
const deployer = new Wallet(deployerPrivateKey, provider);
const allowedSigner = new Wallet(signerPrivateKey);
const artifact = loadResolverArtifact();
const factory = new ContractFactory(artifact.abi, getBytecode(artifact), deployer);

const resolver = await factory.deploy(allowedSigner.address, gatewayUrl);
await resolver.waitForDeployment();

console.log(`Resolver deployed at ${await resolver.getAddress()}`);
console.log(`Allowed signer: ${allowedSigner.address}`);
console.log(`Gateway URL: ${gatewayUrl}`);
