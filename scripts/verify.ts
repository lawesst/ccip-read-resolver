import "dotenv/config";

import { spawnSync } from "node:child_process";

import { AbiCoder } from "ethers";

import { SEPOLIA_CHAIN_ID } from "../src/config.js";
import {
  getAllowedSignerAddress,
  getGatewayUrl,
  getOptionalEnv,
  requireEnv,
} from "../src/runtime.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const resolverAddress = requireEnv("RESOLVER_ADDRESS");
const etherscanApiKey = requireEnv("ETHERSCAN_API_KEY");
const gatewayUrl = getGatewayUrl();
const allowedSignerAddress = getAllowedSignerAddress({ allowDefaultSigner: false });
const chainId = Number(getOptionalEnv("CHAIN_ID") ?? SEPOLIA_CHAIN_ID);

const constructorArgs = abiCoder.encode(
  ["address", "string"],
  [allowedSignerAddress, gatewayUrl],
);

const args = [
  "verify-contract",
  "--chain-id",
  String(chainId),
  "--watch",
  "--etherscan-api-key",
  etherscanApiKey,
  "--constructor-args",
  constructorArgs,
  resolverAddress,
  "contracts/OffchainResolver.sol:OffchainResolver",
];

console.log("Running verification command:");
console.log(
  [
    "forge",
    ...args.map((arg) =>
      arg === etherscanApiKey ? "$ETHERSCAN_API_KEY" : /\s/.test(arg) ? JSON.stringify(arg) : arg,
    ),
  ].join(" "),
);
console.log(`Constructor args: ${constructorArgs}`);

const result = spawnSync("forge", args, {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
