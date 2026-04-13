import express, { type Express, type Request, type Response } from "express";
import { AbiCoder, Wallet, getAddress, namehash } from "ethers";

import {
  buildConfigResult,
  configReaderInterface,
  decodeConfigRequest,
} from "./config-reader.js";
import { DEFAULT_CONFIG_VALUE, SIGNED_CONFIG_READER_DOMAIN_NAME } from "./config.js";
import {
  buildAddrResult,
  buildTextResult,
  dnsDecodeName,
  ensResolverInterface,
} from "./ens.js";
import { encodeGatewayResponse, signResolverResponse } from "./signing.js";

export interface GatewayContext {
  signer: Wallet;
  chainId: number | bigint;
  expectedResolver?: string;
  addrValue?: string;
  configValues?: Record<string, string>;
  getCurrentTimestamp?: () => Promise<number>;
}

const abiCoder = AbiCoder.defaultAbiCoder();
const textSelector = ensResolverInterface.getFunction("text")!.selector.toLowerCase();
const addrSelector = ensResolverInterface.getFunction("addr")!.selector.toLowerCase();
const configSelector = configReaderInterface.getFunction("getString")!.selector.toLowerCase();

export function decodeResolveCallData(callData: string): { name: string; data: string } {
  const [name, data] = abiCoder.decode(["bytes", "bytes"], callData) as unknown as [
    string,
    string,
  ];
  return { name, data };
}

function buildGatewayResult(
  context: GatewayContext,
  request: string,
  data: string,
): { result: string; domainName?: string } {
  const selector = data.slice(0, 10).toLowerCase();

  if (selector === textSelector || selector === addrSelector) {
    const decodedName = dnsDecodeName(request);
    const expectedNode = namehash(decodedName).toLowerCase();

    if (selector === textSelector) {
      const [node, key] = ensResolverInterface.decodeFunctionData("text", data) as unknown as [
        string,
        string,
      ];

      if (node.toLowerCase() !== expectedNode) {
        throw new Error("The DNS-encoded name does not match the namehash in resolver calldata");
      }

      return {
        result: buildTextResult(`https://resolver.demo/${decodedName}/${key}`),
      };
    }

    const [node] = ensResolverInterface.decodeFunctionData("addr", data) as unknown as [string];

    if (node.toLowerCase() !== expectedNode) {
      throw new Error("The DNS-encoded name does not match the namehash in resolver calldata");
    }

    return {
      result: buildAddrResult(context.addrValue ?? context.signer.address),
    };
  }

  if (selector === configSelector) {
    const expectedKey = decodeConfigRequest(request);
    const [key] = configReaderInterface.decodeFunctionData("getString", data) as unknown as [
      string,
    ];

    if (key !== expectedKey) {
      throw new Error("The encoded request key does not match the key in calldata");
    }

    return {
      result: buildConfigResult(context.configValues?.[key] ?? DEFAULT_CONFIG_VALUE),
      domainName: SIGNED_CONFIG_READER_DOMAIN_NAME,
    };
  }

  throw new Error(
    "This starter-kit gateway supports text(bytes32,string), addr(bytes32), and getString(string) lookups",
  );
}

async function buildSignedGatewayPayload(
  context: GatewayContext,
  resolverAddress: string,
  name: string,
  data: string,
): Promise<{
  result: string;
  validUntil: number;
  signature: string;
  response: string;
}> {
  const resolver = getAddress(resolverAddress);
  if (
    context.expectedResolver !== undefined &&
    resolver.toLowerCase() !== context.expectedResolver.toLowerCase()
  ) {
    throw new Error("Gateway is configured for a different resolver address");
  }

  const gatewayResult = buildGatewayResult(context, name, data);
  const currentTimestamp = context.getCurrentTimestamp
    ? await context.getCurrentTimestamp()
    : Math.floor(Date.now() / 1000);
  const validUntil = currentTimestamp + 10 * 60;

  const signedResponse = await signResolverResponse(
    context.signer,
    context.chainId,
    {
      name,
      data,
      result: gatewayResult.result,
      validUntil,
      resolver,
    },
    {
      domainName: gatewayResult.domainName,
    },
  );

  return {
    result: signedResponse.result,
    validUntil,
    signature: signedResponse.signature,
    response: encodeGatewayResponse(
      signedResponse.result,
      validUntil,
      signedResponse.signature,
    ),
  };
}

export function createGatewayApp(context: GatewayContext): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      service: "signed-offchain-data-gateway",
      endpoints: {
        healthz: "/healthz",
        resolve: {
          method: "POST",
          path: "/resolve",
        },
      },
      integrations: ["ens.text", "ens.addr", "config.getString"],
    });
  });

  app.get("/healthz", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      chainId: context.chainId.toString(),
      resolver: context.expectedResolver ?? null,
    });
  });

  app.get("/resolve", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      message: "CCIP-Read clients must POST to /resolve",
      expectedBody: {
        standard: {
          sender: "0xresolverAddress",
          data: "0xoffchainLookupCallData",
        },
        demo: {
          resolver: "0xresolverAddress",
          name: "0xrequestBytes",
          data: "0xapplicationCalldata",
        },
      },
      configuredResolver: context.expectedResolver ?? null,
      chainId: context.chainId.toString(),
      integrations: ["ens.text", "ens.addr", "config.getString"],
    });
  });

  app.post("/resolve", async (request: Request, response: Response) => {
    try {
      if (typeof request.body?.sender === "string" && typeof request.body?.data === "string") {
        const requestPayload = decodeResolveCallData(request.body.data);
        const signedPayload = await buildSignedGatewayPayload(
          context,
          request.body.sender,
          requestPayload.name,
          requestPayload.data,
        );

        response.json({
          data: signedPayload.response,
        });
        return;
      }

      if (
        typeof request.body?.resolver === "string" &&
        typeof request.body?.name === "string" &&
        typeof request.body?.data === "string"
      ) {
        const signedPayload = await buildSignedGatewayPayload(
          context,
          request.body.resolver,
          request.body.name,
          request.body.data,
        );

        response.json({
          result: signedPayload.result,
          validUntil: signedPayload.validUntil,
          signature: signedPayload.signature,
          data: signedPayload.response,
        });
        return;
      }

      response.status(400).json({
        error:
          'Expected either {"sender","data"} for CCIP-Read clients or {"resolver","name","data"} for demo scripts',
        message:
          'Expected either {"sender","data"} for CCIP-Read clients or {"resolver","name","data"} for demo scripts',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown gateway error";
      response
        .status(message === "Gateway is configured for a different resolver address" ? 403 : 400)
        .json({
          error: message,
          message,
        });
    }
  });

  return app;
}
