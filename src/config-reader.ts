import { AbiCoder, Interface } from "ethers";

export const configReaderInterface = new Interface([
  "function getString(string key) view returns (string)",
]);

const abiCoder = AbiCoder.defaultAbiCoder();

export function buildConfigLookup(key: string): { name: string; data: string } {
  return {
    name: abiCoder.encode(["string"], [key]),
    data: configReaderInterface.encodeFunctionData("getString", [key]),
  };
}

export function decodeConfigRequest(request: string): string {
  return abiCoder.decode(["string"], request)[0] as string;
}

export function buildConfigResult(value: string): string {
  return configReaderInterface.encodeFunctionResult("getString", [value]);
}

export function decodeConfigResult(result: string): string {
  return configReaderInterface.decodeFunctionResult("getString", result)[0] as string;
}
