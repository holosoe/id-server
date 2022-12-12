export const holonymIssuers = [
  "0x8281316ac1d51c94f2de77575301cef615adea84", // gov-id
  "0xb625e69ab86db23c23682875ba10fbc8f8756d16", // phone
];
export const relayerURL =
  process.env.NODE_ENV === "development"
    ? process.env.ON_LINUX === "true"
      ? "http://172.17.0.1:6969"
      : "http://host.docker.internal:6969"
    : "https://relayer.holonym.id";
