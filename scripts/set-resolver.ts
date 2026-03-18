import "dotenv/config";

import { Contract, JsonRpcProvider, Wallet, ZeroAddress, getAddress, namehash } from "ethers";

import {
  DEFAULT_DEPLOYER_PRIVATE_KEY,
  INTERFACE_ID_ERC165,
  INTERFACE_ID_IEXTENDED_RESOLVER,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_ENS_REGISTRY_ADDRESS,
  SEPOLIA_NAME_WRAPPER_ADDRESS,
} from "../src/config.js";
import {
  assertExpectedChainId,
  getOptionalEnv,
  getRpcUrl,
  requireEnv,
} from "../src/runtime.js";

const ENS_REGISTRY_ABI = [
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setResolver(bytes32 node, address resolver) external",
] as const;

const NAME_WRAPPER_ABI = [
  "function ownerOf(uint256 id) view returns (address)",
  "function setResolver(bytes32 node, address resolver) external",
] as const;

const ERC165_ABI = [
  "function supportsInterface(bytes4 interfaceID) view returns (bool)",
] as const;

const rpcUrl = getRpcUrl();
const targetName = getOptionalEnv("TARGET_ENS_NAME") ?? getOptionalEnv("ENS_NAME");
if (!targetName) {
  throw new Error("Provide TARGET_ENS_NAME or ENS_NAME for the ENS name you want to update");
}

const resolverAddress = getAddress(requireEnv("RESOLVER_ADDRESS"));
const managerPrivateKey =
  getOptionalEnv("NAME_MANAGER_PRIVATE_KEY")
  ?? getOptionalEnv("DEPLOYER_PRIVATE_KEY")
  ?? DEFAULT_DEPLOYER_PRIVATE_KEY;
const registryAddress = getAddress(
  getOptionalEnv("ENS_REGISTRY_ADDRESS") ?? SEPOLIA_ENS_REGISTRY_ADDRESS,
);
const nameWrapperAddress = getAddress(
  getOptionalEnv("NAME_WRAPPER_ADDRESS") ?? SEPOLIA_NAME_WRAPPER_ADDRESS,
);

const provider = new JsonRpcProvider(rpcUrl);
const manager = new Wallet(managerPrivateKey, provider);
const registry = new Contract(registryAddress, ENS_REGISTRY_ABI, provider);
const registryWriter = new Contract(registryAddress, ENS_REGISTRY_ABI, manager);
const nameWrapper = new Contract(nameWrapperAddress, NAME_WRAPPER_ABI, provider);
const nameWrapperWriter = new Contract(nameWrapperAddress, NAME_WRAPPER_ABI, manager);
const targetResolver = new Contract(resolverAddress, ERC165_ABI, provider);
const { chainId } = await provider.getNetwork();

assertExpectedChainId(chainId, SEPOLIA_CHAIN_ID, "Sepolia resolver update");

const node = namehash(targetName);
const currentOwner = getAddress(await registry.owner(node));
const currentResolver = getAddress(await registry.resolver(node));
const supportsErc165 = await targetResolver.supportsInterface(INTERFACE_ID_ERC165);
const supportsEnsip10 = await targetResolver.supportsInterface(INTERFACE_ID_IEXTENDED_RESOLVER);

if (currentOwner === ZeroAddress) {
  throw new Error(`ENS name "${targetName}" is not owned in the Sepolia ENS registry`);
}

if (!supportsErc165 || !supportsEnsip10) {
  throw new Error(
    `Target resolver ${resolverAddress} does not advertise IERC165 and ENSIP-10 support`,
  );
}

console.log(`Name: ${targetName}`);
console.log(`Node: ${node}`);
console.log(`Manager signer: ${manager.address}`);
console.log(`Registry: ${registryAddress}`);
console.log(`NameWrapper: ${nameWrapperAddress}`);
console.log(`Registry owner: ${currentOwner}`);
console.log(`Current resolver: ${currentResolver}`);
console.log(`Target resolver: ${resolverAddress}`);
console.log(`Target supports IERC165: ${supportsErc165}`);
console.log(`Target supports ENSIP-10: ${supportsEnsip10}`);

if (currentResolver.toLowerCase() === resolverAddress.toLowerCase()) {
  console.log("Resolver is already set to the target address. Nothing to do.");
  process.exit(0);
}

let txHash: string;

if (currentOwner.toLowerCase() === nameWrapperAddress.toLowerCase()) {
  const wrappedOwner = getAddress(await nameWrapper.ownerOf(BigInt(node)));

  console.log("Update route: NameWrapper.setResolver(bytes32,address)");
  console.log(`Wrapped owner: ${wrappedOwner}`);
  if (wrappedOwner.toLowerCase() !== manager.address.toLowerCase()) {
    console.log(
      "Manager signer is not the wrapped owner; continuing because the signer may still be approved.",
    );
  }

  const tx = await nameWrapperWriter.setResolver(node, resolverAddress);
  txHash = tx.hash;
  console.log(`Submitted tx: ${txHash}`);
  await tx.wait();
} else {
  console.log("Update route: ENSRegistry.setResolver(bytes32,address)");
  if (currentOwner.toLowerCase() !== manager.address.toLowerCase()) {
    console.log(
      "Manager signer is not the registry owner; continuing because the signer may still be approved.",
    );
  }

  const tx = await registryWriter.setResolver(node, resolverAddress);
  txHash = tx.hash;
  console.log(`Submitted tx: ${txHash}`);
  await tx.wait();
}

const confirmedResolver = getAddress(await registry.resolver(node));
console.log(`Confirmed resolver: ${confirmedResolver}`);

if (confirmedResolver.toLowerCase() !== resolverAddress.toLowerCase()) {
  throw new Error("Resolver update transaction mined, but the ENS registry still shows a different resolver");
}

console.log("Resolver updated successfully.");
