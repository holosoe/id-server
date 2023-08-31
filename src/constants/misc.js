// TODO: holonymAddresses should only include addresses owned
// by Holonym that have been designated specifically for receiving
// funds. The relayer address should not be in this list.
export const holonymAddresses = [
  "0xb1f50c6c34c72346b1229e5c80587d0d659556fd", // Relayer
];

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

export const supportedChainIds = [
  10, // Optimism
  250, // Fantom
];
