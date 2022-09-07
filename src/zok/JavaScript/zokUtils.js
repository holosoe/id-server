export function toU32StringArray(bytes) {
  let u32s = chunk(bytes.toString("hex"), 8);
  return u32s.map((x) => parseInt(x, 16).toString());
}
export function chunk(arr, chunkSize) {
  let out = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    out.push(chunk);
  }
  return out;
}

// Expects arguments of type bytes and returns an array of U32s -- all inputs concatenated/flattened, then split up into u32s
// This is how ZoKrates CLI expects arguments
export function argsToU32CLIArgs(args) {
  return toU32StringArray(Buffer.concat(args))
    .map((x) => parseInt(x))
    .join(" ");
}
