import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  ContractFactory,
  getCreateAddress,
  type InterfaceAbi,
  JsonRpcProvider,
  Wallet,
} from "ethers";

import {
  DEFAULT_ANVIL_RPC_URL,
  DEFAULT_DEPLOYER_PRIVATE_KEY,
  DEFAULT_SAMPLE_NAME,
  DEFAULT_SIGNER_PRIVATE_KEY,
  DEFAULT_TEXT_KEY,
} from "../src/config.js";
import { buildTextLookup, decodeTextResult } from "../src/ens.js";
import { createGatewayApp, decodeResolveCallData } from "../src/gateway.js";
import { encodeGatewayResponse, recoverResolverSigner } from "../src/signing.js";

interface FoundryArtifact {
  abi: InterfaceAbi;
  bytecode?: string | { object?: string };
}

interface GatewayHttpResponse {
  result: string;
  validUntil: number;
  signature: string;
}

function loadResolverArtifact(): FoundryArtifact {
  const artifactUrl = new URL(
    "../out/OffchainResolver.sol/OffchainResolver.json",
    import.meta.url,
  );

  try {
    return JSON.parse(readFileSync(artifactUrl, "utf8")) as FoundryArtifact;
  } catch {
    throw new Error('Missing Foundry artifact. Run "npm run build" before "npm run demo".');
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

function extractRevertData(error: unknown): string {
  const candidates = [
    (error as { data?: unknown })?.data,
    (error as { error?: { data?: unknown } })?.error?.data,
    (error as { info?: { error?: { data?: unknown } } })?.info?.error?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("0x")) {
      return candidate;
    }
  }

  throw new Error("Could not extract revert data for OffchainLookup");
}

async function startGateway(app: ReturnType<typeof createGatewayApp>): Promise<{
  httpServer: Server;
  url: string;
}> {
  const httpServer = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const address = httpServer.address() as AddressInfo;
  return {
    httpServer,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function stopGateway(httpServer: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_ANVIL_RPC_URL;
  const deployerPrivateKey =
    process.env.DEPLOYER_PRIVATE_KEY ?? DEFAULT_DEPLOYER_PRIVATE_KEY;
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY ?? DEFAULT_SIGNER_PRIVATE_KEY;
  const provider = new JsonRpcProvider(rpcUrl);
  const deployer = new Wallet(deployerPrivateKey, provider);
  const signer = new Wallet(signerPrivateKey);
  const { chainId } = await provider.getNetwork();

  const deploymentNonce = await provider.getTransactionCount(deployer.address);
  const expectedResolver = getCreateAddress({
    from: deployer.address,
    nonce: deploymentNonce,
  });

  const gateway = createGatewayApp({
    signer,
    chainId,
    expectedResolver,
    getCurrentTimestamp: async () => {
      const block = await provider.getBlock("latest");
      if (!block) {
        throw new Error("Could not fetch latest block");
      }

      return Number(block.timestamp);
    },
  });

  const { httpServer, url } = await startGateway(gateway);

  try {
    const artifact = loadResolverArtifact();
    const factory = new ContractFactory(artifact.abi, getBytecode(artifact), deployer);
    const resolver = await factory.deploy(signer.address, `${url}/resolve`);
    await resolver.waitForDeployment();

    const resolverAddress = await resolver.getAddress();
    const lookup = buildTextLookup(
      process.env.ENS_NAME ?? DEFAULT_SAMPLE_NAME,
      process.env.TEXT_KEY ?? DEFAULT_TEXT_KEY,
    );

    let sender: string;
    let urls: string[];
    let callData: string;
    let callbackFunction: string;
    let extraData: string;

    try {
      await resolver.getFunction("resolve").staticCall(lookup.name, lookup.data);
      throw new Error("resolve() returned unexpectedly instead of reverting with OffchainLookup");
    } catch (error) {
      const revertData = extractRevertData(error);
      const parsedError = resolver.interface.parseError(revertData);
      if (parsedError?.name !== "OffchainLookup") {
        throw error;
      }

      sender = parsedError.args[0] as string;
      urls = parsedError.args[1] as string[];
      callData = parsedError.args[2] as string;
      callbackFunction = parsedError.args[3] as string;
      extraData = parsedError.args[4] as string;
    }

    const requestPayload = decodeResolveCallData(callData);
    const gatewayResponse = await fetch(urls[0], {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        resolver: sender,
        name: requestPayload.name,
        data: requestPayload.data,
      }),
    });

    if (!gatewayResponse.ok) {
      throw new Error(`Gateway returned ${gatewayResponse.status}: ${await gatewayResponse.text()}`);
    }

    const signedPayload = (await gatewayResponse.json()) as GatewayHttpResponse;
    const recoveredSigner = recoverResolverSigner(
      chainId,
      {
        ...requestPayload,
        result: signedPayload.result,
        validUntil: signedPayload.validUntil,
        resolver: sender,
      },
      signedPayload.signature,
    );

    const response = encodeGatewayResponse(
      signedPayload.result,
      signedPayload.validUntil,
      signedPayload.signature,
    );

    const finalResult = (await resolver.getFunction("resolveWithProof").staticCall(
      response,
      extraData,
    )) as string;

    console.log(`Resolver deployed at ${resolverAddress}`);
    console.log(`Allowed signer: ${signer.address}`);
    console.log(`OffchainLookup sender: ${sender}`);
    console.log(`Extracted callData: ${callData}`);
    console.log(`Gateway URL: ${urls[0]}`);
    console.log(`Callback selector: ${callbackFunction}`);
    console.log(`Recovered signer: ${recoveredSigner}`);
    console.log(`Final resolved value: ${decodeTextResult(finalResult)}`);
  } finally {
    await stopGateway(httpServer);
  }
}

await main();
