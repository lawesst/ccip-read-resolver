import { getAddress, Wallet } from "ethers";

import {
  DEFAULT_ANVIL_RPC_URL,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_SIGNER_PRIVATE_KEY,
} from "./config.js";

export function getRpcUrl(): string {
  return process.env.SEPOLIA_RPC_URL ?? process.env.RPC_URL ?? DEFAULT_ANVIL_RPC_URL;
}

export function getGatewayUrl(): string {
  return process.env.GATEWAY_URL ?? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/resolve`;
}

export function getAllowedSignerAddress(options?: { allowDefaultSigner?: boolean }): string {
  if (process.env.ALLOWED_SIGNER_ADDRESS) {
    return getAddress(process.env.ALLOWED_SIGNER_ADDRESS);
  }

  if (process.env.SIGNER_PRIVATE_KEY) {
    return new Wallet(process.env.SIGNER_PRIVATE_KEY).address;
  }

  if (options?.allowDefaultSigner === false) {
    throw new Error(
      "Provide ALLOWED_SIGNER_ADDRESS or SIGNER_PRIVATE_KEY for this operation",
    );
  }

  return new Wallet(DEFAULT_SIGNER_PRIVATE_KEY).address;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
