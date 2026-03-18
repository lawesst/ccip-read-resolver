import "dotenv/config";

import { JsonRpcProvider, Wallet, getAddress } from "ethers";

import {
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNER_PRIVATE_KEY,
} from "../src/config.js";
import { createGatewayApp } from "../src/gateway.js";
import { getOptionalEnv, getRpcUrl, requireEnv } from "../src/runtime.js";

const rpcUrl = getRpcUrl();
const privateKey = getOptionalEnv("SIGNER_PRIVATE_KEY") ?? DEFAULT_SIGNER_PRIVATE_KEY;
const port = Number(getOptionalEnv("PORT") ?? DEFAULT_GATEWAY_PORT);
const resolverAddress = requireEnv("RESOLVER_ADDRESS");

const provider = new JsonRpcProvider(rpcUrl);
const { chainId } = await provider.getNetwork();
const signer = new Wallet(privateKey);
const configuredAddrValue = getOptionalEnv("ADDR_VALUE");
const addrValue = configuredAddrValue ? getAddress(configuredAddrValue) : signer.address;

const app = createGatewayApp({
  signer,
  chainId,
  expectedResolver: getAddress(resolverAddress),
  addrValue,
  getCurrentTimestamp: async () => {
    const block = await provider.getBlock("latest");
    if (!block) {
      throw new Error("Could not fetch latest block for validity window");
    }

    return Number(block.timestamp);
  },
});

app.listen(port, () => {
  console.log(`Gateway listening on http://127.0.0.1:${port}/resolve`);
  console.log(`Signing with ${signer.address} for chain ${chainId.toString()}`);
  console.log(`Allowed resolver: ${getAddress(resolverAddress)}`);
  console.log(`addr(bytes32) value: ${addrValue}`);
});
