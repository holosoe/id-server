import { ethers } from "ethers";

export const idServerPaymentAddress = "0xdca2e9ae8423d7b0f94d7f9fc09e698a45f3c851";

// Holonym multisig on Ethereum
export const companyENS = "holonym.eth";

// Holonym multisig on Optimism
export const companyAddressOP = "0x03627Ac5A08056B50084d8B9cf550EB74a13C78A";

export const companyAddressFTM = "0xbe20d0A27B79BA2E53c9DF150BadAa21D4783D42";

export const companyAddressAVAX = "0xbe20d0A27B79BA2E53c9DF150BadAa21D4783D42";

export const companyAddressAurora = "0xbe20d0A27B79BA2E53c9DF150BadAa21D4783D42";

export const holonymIssuers = [
  "0x8281316ac1d51c94f2de77575301cef615adea84", // gov-id
  "0xb625e69ab86db23c23682875ba10fbc8f8756d16", // phone
  "0xfc8a8de489efefb91b42bb8b1a6014b71211a513", // phone dev
];
export const relayerURL =
  process.env.NODE_ENV === "development"
    ? process.env.ON_LINUX === "true"
      ? "http://172.17.0.1:6969"
      : "http://host.docker.internal:6969"
    : // : "https://relayer.holonym.id";
      "https://relayer.holonym-internal.net";

const supportedChainIds = [
  1, // Ethereum
  10, // Optimism
  250, // Fantom
  43114, // Avalanche
  1313161554, // Aurora
];
if (process.env.NODE_ENV === "development") {
  supportedChainIds.push(420); // Optimism goerli
}
export { supportedChainIds };

export const sessionStatusEnum = {
  NEEDS_PAYMENT: "NEEDS_PAYMENT",
  IN_PROGRESS: "IN_PROGRESS",
  ISSUED: "ISSUED",
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  REFUNDED: "REFUNDED",
};

// export const ethereumProvider = new ethers.providers.AlchemyProvider(
//   "homestead",
//   process.env.ALCHEMY_APIKEY
// );
// export const optimismProvider = new ethers.providers.AlchemyProvider(
//   "optimism",
//   process.env.ALCHEMY_APIKEY
// );
// export const optimismGoerliProvider = new ethers.providers.AlchemyProvider(
//   "optimism-goerli",
//   process.env.ALCHEMY_APIKEY
// );
export const ethereumProvider = new ethers.providers.JsonRpcProvider(
  process.env.ETHEREUM_RPC_URL
);
export const optimismProvider = new ethers.providers.JsonRpcProvider(
  process.env.OPTIMISM_RPC_URL
);
export const optimismGoerliProvider = new ethers.providers.JsonRpcProvider(
  process.env.OPTIMISM_GOERLI_RPC_URL
);
export const fantomProvider = new ethers.providers.JsonRpcProvider(
  "https://rpc.ftm.tools"
);
export const avalancheProvider = new ethers.providers.JsonRpcProvider(
  "https://api.avax.network/ext/bc/C/rpc"
);
export const auroraProvider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.aurora.dev"
);

export const payPalApiUrlBase =
  process.env.NODE_ENV === "production"
    ? `https://api-m.paypal.com`
    : `https://api-m.sandbox.paypal.com`;
