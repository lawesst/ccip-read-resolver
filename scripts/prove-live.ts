import "dotenv/config";

import { readFileSync } from "node:fs";

import { type InterfaceAbi, Interface, JsonRpcProvider } from "ethers";

import {
  DEFAULT_SAMPLE_NAME,
  DEFAULT_TEXT_KEY,
} from "../src/config.js";
import { buildTextLookup, decodeTextResult } from "../src/ens.js";
import { decodeResolveCallData } from "../src/gateway.js";
import { encodeGatewayResponse, recoverResolverSigner } from "../src/signing.js";
import { getOptionalEnv, getRpcUrl, requireEnv } from "../src/runtime.js";

interface GatewayHttpResponse {
  result: string;
  validUntil: number;
  signature: string;
}

function loadResolverInterface(): Interface {
  const artifactUrl = new URL(
    "../out/OffchainResolver.sol/OffchainResolver.json",
    import.meta.url,
  );

  try {
    const artifact = JSON.parse(readFileSync(artifactUrl, "utf8")) as { abi: InterfaceAbi };
    return new Interface(artifact.abi);
  } catch {
    throw new Error('Missing Foundry artifact. Run "npm run build" before "npm run prove:sepolia".');
  }
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

const rpcUrl = getRpcUrl();
const resolverAddress = requireEnv("RESOLVER_ADDRESS");
const provider = new JsonRpcProvider(rpcUrl);
const resolverInterface = loadResolverInterface();
const name = getOptionalEnv("ENS_NAME") ?? DEFAULT_SAMPLE_NAME;
const key = getOptionalEnv("TEXT_KEY") ?? DEFAULT_TEXT_KEY;
const lookup = buildTextLookup(name, key);
const { chainId } = await provider.getNetwork();

let sender: string;
let urls: string[];
let callData: string;
let callbackFunction: string;
let extraData: string;

try {
  await provider.call({
    to: resolverAddress,
    data: resolverInterface.encodeFunctionData("resolve", [lookup.name, lookup.data]),
  });
  throw new Error("resolve() returned unexpectedly instead of reverting with OffchainLookup");
} catch (error) {
  const revertData = extractRevertData(error);
  const parsedError = resolverInterface.parseError(revertData);
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

const finalResult = await provider.call({
  to: resolverAddress,
  data: resolverInterface.encodeFunctionData("resolveWithProof", [response, extraData]),
});
const resolvedBytes = resolverInterface.decodeFunctionResult("resolveWithProof", finalResult)[0] as string;

console.log(`Resolver: ${resolverAddress}`);
console.log(`Gateway URL: ${urls[0]}`);
console.log(`Callback selector: ${callbackFunction}`);
console.log(`Recovered signer: ${recoveredSigner}`);
console.log(`Resolved name: ${name}`);
console.log(`Text key: ${key}`);
console.log(`Final resolved value: ${decodeTextResult(resolvedBytes)}`);
