import {
  AbiCoder,
  type TypedDataDomain,
  type TypedDataField,
  Wallet,
  verifyTypedData,
} from "ethers";

export const OFFCHAIN_RESOLVER_DOMAIN_NAME = "OffchainResolver";
export const OFFCHAIN_RESOLVER_DOMAIN_VERSION = "1";

export const OFFCHAIN_RESOLVER_TYPES: Record<string, TypedDataField[]> = {
  Response: [
    { name: "name", type: "bytes" },
    { name: "data", type: "bytes" },
    { name: "result", type: "bytes" },
    { name: "validUntil", type: "uint64" },
    { name: "resolver", type: "address" },
  ],
};

export interface ResolverResponsePayload {
  name: string;
  data: string;
  result: string;
  validUntil: number | bigint;
  resolver: string;
}

export interface SignedResolverResponse extends ResolverResponsePayload {
  signature: string;
  response: string;
}

const abiCoder = AbiCoder.defaultAbiCoder();

export function buildResolverDomain(
  chainId: number | bigint,
  resolver: string,
): TypedDataDomain {
  return {
    name: OFFCHAIN_RESOLVER_DOMAIN_NAME,
    version: OFFCHAIN_RESOLVER_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract: resolver,
  };
}

export function encodeGatewayResponse(
  result: string,
  validUntil: number | bigint,
  signature: string,
): string {
  return abiCoder.encode(["bytes", "uint64", "bytes"], [result, validUntil, signature]);
}

export async function signResolverResponse(
  signer: Wallet,
  chainId: number | bigint,
  payload: ResolverResponsePayload,
): Promise<SignedResolverResponse> {
  const normalizedPayload = {
    ...payload,
    validUntil: BigInt(payload.validUntil),
  };

  const signature = await signer.signTypedData(
    buildResolverDomain(chainId, payload.resolver),
    OFFCHAIN_RESOLVER_TYPES,
    normalizedPayload,
  );

  return {
    ...normalizedPayload,
    signature,
    response: encodeGatewayResponse(
      normalizedPayload.result,
      normalizedPayload.validUntil,
      signature,
    ),
  };
}

export function recoverResolverSigner(
  chainId: number | bigint,
  payload: ResolverResponsePayload,
  signature: string,
): string {
  return verifyTypedData(
    buildResolverDomain(chainId, payload.resolver),
    OFFCHAIN_RESOLVER_TYPES,
    {
      ...payload,
      validUntil: BigInt(payload.validUntil),
    },
    signature,
  );
}
