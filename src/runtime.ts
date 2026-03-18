import { getAddress, Wallet } from "ethers";

import {
  DEFAULT_ANVIL_RPC_URL,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNER_PRIVATE_KEY,
} from "./config.js";

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getRpcUrl(): string {
  return getOptionalEnv("SEPOLIA_RPC_URL") ?? getOptionalEnv("RPC_URL") ?? DEFAULT_ANVIL_RPC_URL;
}

export function getGatewayUrl(): string {
  return getOptionalEnv("GATEWAY_URL") ?? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/resolve`;
}

export function getAllowedSignerAddress(options?: { allowDefaultSigner?: boolean }): string {
  const allowedSignerAddress = getOptionalEnv("ALLOWED_SIGNER_ADDRESS");
  if (allowedSignerAddress) {
    return getAddress(allowedSignerAddress);
  }

  const signerPrivateKey = getOptionalEnv("SIGNER_PRIVATE_KEY");
  if (signerPrivateKey) {
    return new Wallet(signerPrivateKey).address;
  }

  if (options?.allowDefaultSigner === false) {
    throw new Error(
      "Provide ALLOWED_SIGNER_ADDRESS or SIGNER_PRIVATE_KEY for this operation",
    );
  }

  return new Wallet(DEFAULT_SIGNER_PRIVATE_KEY).address;
}

export function requireEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function assertExpectedChainId(
  actualChainId: number | bigint,
  expectedChainId: number,
  label = "operation",
): void {
  if (Number(actualChainId) !== expectedChainId) {
    throw new Error(
      `${label} expected chainId ${expectedChainId}, but RPC returned ${actualChainId.toString()}`,
    );
  }
}
