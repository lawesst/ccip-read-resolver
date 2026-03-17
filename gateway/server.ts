import { JsonRpcProvider, Wallet, getAddress } from "ethers";

import {
  DEFAULT_ANVIL_RPC_URL,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNER_PRIVATE_KEY,
} from "../src/config.js";
import { createGatewayApp } from "../src/gateway.js";

const rpcUrl = process.env.RPC_URL ?? DEFAULT_ANVIL_RPC_URL;
const privateKey = process.env.SIGNER_PRIVATE_KEY ?? DEFAULT_SIGNER_PRIVATE_KEY;
const port = Number(process.env.PORT ?? DEFAULT_GATEWAY_PORT);
const resolverAddress = process.env.RESOLVER_ADDRESS;

if (!resolverAddress) {
  throw new Error("RESOLVER_ADDRESS is required so the gateway only signs for one resolver");
}

const provider = new JsonRpcProvider(rpcUrl);
const { chainId } = await provider.getNetwork();
const signer = new Wallet(privateKey);

const app = createGatewayApp({
  signer,
  chainId,
  expectedResolver: getAddress(resolverAddress),
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
});
