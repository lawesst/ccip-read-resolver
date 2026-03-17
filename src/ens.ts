import {
  Interface,
  getBytes,
  hexlify,
  namehash,
  toUtf8Bytes,
  toUtf8String,
} from "ethers";

export const ensResolverInterface = new Interface([
  "function text(bytes32 node,string key) view returns (string)",
]);

export function dnsEncodeName(name: string): string {
  if (name.length === 0) {
    return "0x00";
  }

  const labels = name.split(".");
  const encoded: number[] = [];

  for (const label of labels) {
    const labelBytes = [...toUtf8Bytes(label)];
    if (labelBytes.length === 0 || labelBytes.length > 63) {
      throw new Error(`Invalid DNS label length for "${label}"`);
    }

    encoded.push(labelBytes.length, ...labelBytes);
  }

  encoded.push(0);
  return hexlify(Uint8Array.from(encoded));
}

export function dnsDecodeName(encodedName: string): string {
  const bytes = getBytes(encodedName);
  const labels: string[] = [];

  for (let offset = 0; offset < bytes.length; ) {
    const labelLength = bytes[offset];
    if (labelLength === 0) {
      if (offset !== bytes.length - 1) {
        throw new Error("DNS-encoded name contains trailing bytes");
      }

      return labels.join(".");
    }

    const start = offset + 1;
    const end = start + labelLength;
    if (end > bytes.length) {
      throw new Error("DNS-encoded name is truncated");
    }

    labels.push(toUtf8String(bytes.slice(start, end)));
    offset = end;
  }

  throw new Error("DNS-encoded name is missing the root label");
}

export function buildTextLookup(name: string, key: string): { name: string; data: string } {
  return {
    name: dnsEncodeName(name),
    data: ensResolverInterface.encodeFunctionData("text", [namehash(name), key]),
  };
}

export function buildTextResult(value: string): string {
  return ensResolverInterface.encodeFunctionResult("text", [value]);
}

export function decodeTextResult(result: string): string {
  return ensResolverInterface.decodeFunctionResult("text", result)[0] as string;
}
