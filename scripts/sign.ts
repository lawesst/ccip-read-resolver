import "dotenv/config";

import { Wallet } from "ethers";

import {
  DEFAULT_SAMPLE_NAME,
  DEFAULT_SIGNER_PRIVATE_KEY,
  DEFAULT_TEXT_KEY,
} from "../src/config.js";
import { buildTextLookup, buildTextResult } from "../src/ens.js";
import {
  OFFCHAIN_RESOLVER_TYPES,
  buildResolverDomain,
  recoverResolverSigner,
  signResolverResponse,
} from "../src/signing.js";
import { getOptionalEnv } from "../src/runtime.js";

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

const sampleName = getOptionalEnv("ENS_NAME") ?? DEFAULT_SAMPLE_NAME;
const sampleKey = getOptionalEnv("TEXT_KEY") ?? DEFAULT_TEXT_KEY;
const resolver = getOptionalEnv("RESOLVER_ADDRESS") ?? "0x0000000000000000000000000000000000000001";
const chainId = Number(getOptionalEnv("CHAIN_ID") ?? 31337);
const signer = new Wallet(getOptionalEnv("SIGNER_PRIVATE_KEY") ?? DEFAULT_SIGNER_PRIVATE_KEY);

const { name, data } = buildTextLookup(sampleName, sampleKey);
const result = buildTextResult(
  getOptionalEnv("TEXT_VALUE") ?? `https://resolver.demo/${sampleName}/${sampleKey}`,
);
const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;

const signed = await signResolverResponse(signer, chainId, {
  name,
  data,
  result,
  validUntil,
  resolver,
});

const recoveredSigner = recoverResolverSigner(
  chainId,
  {
    name,
    data,
    result,
    validUntil,
    resolver,
  },
  signed.signature,
);

console.log(
  JSON.stringify(
    {
      domain: buildResolverDomain(chainId, resolver),
      types: OFFCHAIN_RESOLVER_TYPES,
      payload: {
        name,
        data,
        result,
        validUntil,
        resolver,
      },
      signer: signer.address,
      recoveredSigner,
      signature: signed.signature,
      encodedResponse: signed.response,
    },
    jsonReplacer,
    2,
  ),
);
