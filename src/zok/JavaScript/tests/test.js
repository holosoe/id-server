/**
 * For ad hoc tests.
 */
import { initialize } from "zokrates-js";
import { ethers } from "ethers";
import { createSmallLeaf } from "../zokWrapper.js";

async function testCreateSmallLeaf() {
  const hash = await createSmallLeaf(
    Buffer.alloc(20),
    Buffer.alloc(2),
    Buffer.alloc(16)
  );
  console.log(hash);
  console.log(parseInt(hash.toString("hex"), 16));
}

async function testZoKratesToBits() {
  const zokProvider = await initialize();
  const source = `import "utils/casts/u32_array_to_bool_array" as to_bits;
  def main() -> field {
    u32[8] input = [0, 0, 0, 0, 0, 0, 0, 72];
    
    bool[256] input_as_bits = to_bits(input);

    // Shift right 3 bits, and convert to field
    // Forked from: https://github.com/Zokrates/ZoKrates/blob/deploy/zokrates_stdlib/stdlib/utils/pack/bool/pack.zok
    field mut out = 0;
    for u32 j in 0..253 {
        u32 i = 253 - (j + 1);
        out = out + (input_as_bits[i] ? 2 ** j : 0);
    }
    return out;
  }`;
  const artifacts = zokProvider.compile(source);
  const { witness, output } = zokProvider.computeWitness(artifacts, []);
  console.log(output);
}

function testPrimesProduct() {
  const primes = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79,
    83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
    173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257,
    263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353,
    359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449,
    457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563,
    569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653,
    659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761,
    769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877,
    881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991,
    997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051, 1061, 1063, 1069, 1087,
    1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163,
  ];
  let count = 0;
  let product = ethers.BigNumber.from(1);
  for (const p of primes) {
    product = product.mul(p);
    console.log(product.toString());
    console.log();
    count += 1;
  }
}

testPrimesProduct();
