export const idServerPaymentAddress = "0xdca2e9ae8423d7b0f94d7f9fc09e698a45f3c851";

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
  10, // Optimism
  250, // Fantom
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
