import "dotenv/config";

import { JsonRpcProvider } from "ethers";

import {
  DEFAULT_TEXT_KEY,
  SEPOLIA_CHAIN_ID,
} from "../src/config.js";
import { assertExpectedChainId, getOptionalEnv, getRpcUrl } from "../src/runtime.js";

const rpcUrl = getRpcUrl();
const provider = new JsonRpcProvider(rpcUrl);
const name = getOptionalEnv("TARGET_ENS_NAME") ?? "chrisfranko.eth";
const key = getOptionalEnv("TEXT_KEY") ?? DEFAULT_TEXT_KEY;
const { chainId } = await provider.getNetwork();

assertExpectedChainId(chainId, SEPOLIA_CHAIN_ID, "Sepolia name check");

const resolver = await provider.getResolver(name);
if (!resolver) {
  throw new Error(`No resolver found for ${name}`);
}

const [resolvedAddress, textValue] = await Promise.all([
  provider.resolveName(name),
  resolver.getText(key),
]);

console.log(`Name: ${name}`);
console.log(`Resolver: ${resolver.address}`);
console.log(`addr: ${resolvedAddress ?? "null"}`);
console.log(`${key}: ${textValue ?? "null"}`);
