import "dotenv/config";

import { Wallet } from "ethers";

import {
  DEFAULT_CONFIG_KEY,
  DEFAULT_CONFIG_VALUE,
  DEFAULT_SAMPLE_NAME,
  DEFAULT_SIGNER_PRIVATE_KEY,
  DEFAULT_TEXT_KEY,
  OFFCHAIN_RESOLVER_DOMAIN_NAME,
  SIGNED_CONFIG_READER_DOMAIN_NAME,
} from "../src/config.js";
import {
  buildConfigLookup,
  buildConfigResult,
} from "../src/config-reader.js";
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

const sampleKind = getOptionalEnv("SAMPLE_KIND") ?? "ens";
const resolver = getOptionalEnv("RESOLVER_ADDRESS") ?? "0x0000000000000000000000000000000000000001";
const chainId = Number(getOptionalEnv("CHAIN_ID") ?? 31337);
const signer = new Wallet(getOptionalEnv("SIGNER_PRIVATE_KEY") ?? DEFAULT_SIGNER_PRIVATE_KEY);
const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;
const sampleName = getOptionalEnv("ENS_NAME") ?? DEFAULT_SAMPLE_NAME;
const sampleKey = getOptionalEnv("TEXT_KEY") ?? DEFAULT_TEXT_KEY;
const configKey = getOptionalEnv("CONFIG_KEY") ?? DEFAULT_CONFIG_KEY;
const configValue = getOptionalEnv("CONFIG_VALUE") ?? DEFAULT_CONFIG_VALUE;

const sample =
  sampleKind === "config"
    ? {
        name: buildConfigLookup(configKey).name,
        data: buildConfigLookup(configKey).data,
        result: buildConfigResult(configValue),
        domainName: SIGNED_CONFIG_READER_DOMAIN_NAME,
      }
    : {
        name: buildTextLookup(sampleName, sampleKey).name,
        data: buildTextLookup(sampleName, sampleKey).data,
        result: buildTextResult(
          getOptionalEnv("TEXT_VALUE") ?? `https://resolver.demo/${sampleName}/${sampleKey}`,
        ),
        domainName: OFFCHAIN_RESOLVER_DOMAIN_NAME,
      };

const signed = await signResolverResponse(signer, chainId, {
  name: sample.name,
  data: sample.data,
  result: sample.result,
  validUntil,
  resolver,
}, {
  domainName: sample.domainName,
});

const recoveredSigner = recoverResolverSigner(
  chainId,
  {
    name: sample.name,
    data: sample.data,
    result: sample.result,
    validUntil,
    resolver,
  },
  signed.signature,
  {
    domainName: sample.domainName,
  },
);

console.log(
  JSON.stringify(
    {
      sampleKind,
      domain: buildResolverDomain(chainId, resolver, sample.domainName),
      types: OFFCHAIN_RESOLVER_TYPES,
      payload: {
        name: sample.name,
        data: sample.data,
        result: sample.result,
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
