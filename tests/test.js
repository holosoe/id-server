/**
 * For ad hoc tests.
 */
import axios from "axios";
import { webcrypto } from "crypto";
import { initialize } from "zokrates-js";
import { ethers } from "ethers";
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";
import { createSmallLeaf } from "../src/zok/JavaScript/zokWrapper.js";

// console.log("(initializing zokrates provider...)");
// const zokProvider = await initialize();
// const source = `import "hashes/poseidon/poseidon" as poseidon;
// def main(field[2] input) -> field {
//   return poseidon(input);
// }`;
// const poseidonHashArtifacts = zokProvider.compile(source);

const privateKey = {
  key_ops: ["decrypt"],
  ext: true,
  kty: "RSA",
  n: "wZQBp5vWiFTU9ORIzlySpULJQB7XuZIZ46CH3DKweg-eukKfU1YGX8H_aNLFzDThSR_Gv7xnZ2AfoN_-EAqrLGf0T310j-FfAbe5JUMvxrH02Zk5LhZw5tu5n4XEJRHIAqJPUy_0vFS4-zfmGLIDpDgidRFh8eg_ghTEkOWybe99cg2qo_sa1m-ANr5j4qzpUFnOjZwvaWyhmBdlu7gtOC15BRwBP97Rp0bNeGEulEpoxPtks8XjgWXJ4MM7L8m2SkyHOTKGrrTXmAStvlbolWnq27S1QqTznMec4s2r9pUpfNwQGbbi7xTruTic-_zuvcvYqJwx-mpG7EQrwNIFK2KvM1PogezS6_2zYRy2uQTqpsLTEsaP-o-J4cylWQ3fikGh2EShzVKhgr1DWOy2Bmv9pZq5C7R_5OpApfwvTt3lFAWFjOez0ggHM9UbuKuUNay_D4bTEOaupBzDbkrn1hymgFuQtO97Wh6bFQKTHqpFiEy-LbPkoTKq6K0wNzsTne8-laBOPpYzTgtV9V_XFnR7EjsAYOaqLYU2pnr8UrhcMqsY1AIQDWvKqKMzDo25g6wQFtYnKQ8xEnVC1pT2P4Dt3Fx4Y6Uzg866rifn7MRpZBfXc5vsOnN46rSQLksWJrt8noxEbBGzi7Qi67O9EE9gWYSW2vWp3N6v81Isx9k",
  e: "AQAB",
  d: "uYR28YLQX2etj-UYQW1GvUr8RI9Kf3YdiaFXkxihONmvbSJcPym6ghsSBAu7tLEZF1N0zlxpXREqPqtseUNAORaHdYbuJtX-j07cCXISX4I8_i1yN1EacqUxiEhSapRX8u5Kx5a2Hae0gE5aHmC8TK3fmAJIs-W4t5nfqF36WpGiz6N5Xh5Q4iGJ5u0gHSVJlM_8vIpqhcauN2x0-yrPa39o9BSavfN1SbL5R90bHtMRBXdIU2HbXy-GAfoYxvux0BL3pUFfAiAeXnpdaIUx8b_IbTcKYAxlzGMhX9tsaq0ZTag5Zet4IVkTcDdpe7Yzt4Gc6jqHS05_Gf9bTzf36qmhNuifsbpitBiC-HvunCkT2lOmfKNg5Ns0pTv5IvejTY_6tjUAinoILgcpFYJrWCZaRhG1E7b9kaYDVcgDDltxip0Rsu4pGpUk-ET7gynjadHo60vSTn-7PVJTkf12c_Bx22gKOg35ruMV4ZW9iNKIGnVgAEzt1OIwLL-tGJ1kcRixWSK3iNhphAki_FJQKb9d3PWFbtqfYYpIfy9gCOMC1TP7OatVEr9MEiDMCXe2zcLg2souH-0qzx6NkfGCf24mT8n3eQg4R3mdq9vyTLGtiwAd4JO4cOlBi_dieIsGPZ7QTkwTV0F18_wtI2eszOa-QQG3p3UIy1Fam-MsuAE",
  p: "4_hPwZpEC6yP8eYssi29sE8o4LnvNbdvJy-8eAm_s2tJVABbqE31CRSlo3vyR6a90zRpLfdtApcTePwYNKEe37d9GHYeshOMoAPLok2GlY-zYqVXH6tth-mHPA-_-yLsp7hQtLdFqp-OnbhMpa-gTkiMtszOyFBXHcjwgUWARj4MDj5LGNs_QTZEzvujDje36XQ1ErRqELZGEAUKFbpyEuEHZBirCCtSsMvwPbmpb2wgmmMQxo4y-1kqPge5s2wt7XfWMSlWkEk3GAoQKSgyABhyDq619bNLdD-G38j4ch-AAkRnnnZ-mLEOFMbYGEAlc7LwzKa25np7fBqNmo1VeQ",
  q: "2WEpgbbWHVMrDotd1PgTEeSNA9fsUkhSS6bNxwA6waF1cfuWkTap2BDj82-za7Mwp_ihCOZg_D-2yaVZdrfudVNbU1TzBQZUN5fg73S4eKkYdQAijZN2Cahl1IkktFxmWOWo8XbrXx_0_j3V-lpaZKhxu3a-gTjJL059qp8QhL4IlMmy9CjExPwjNoUlM4pSL9NkVWIFgkHJOVnf_bMfJGf-vZd3sjHzjBPxHP7hTehplWpA30UN1bceiLKNJtgoyi9wC0JBvmcWzleC_Vq1oZzmw2A8UnuQZXAmImPS1E47XBGm4nNMX31VNp7TUZlVFArlLkRtDEgxcY8M1rpNYQ",
  dp: "xzaYy8A5MlJrv6G68UGTf9zNBgS1iyVvFrlaYzNxuCJLBAMEFcF6HaNTU9feUsrdGxGz0B1lv1uyAomZxXP-_NTllliyXj9DJhnq-zvwHgZjZhLCXcR6hMiICu5gf993GuGwdRuq331rLVx-blNZLM-tV5kGInpChp6vvOe1Pqy98Dxzd5cwYZZA7vdq9-Os7W9FacEK5uvBsgIVXAN_6AuJX-lGnG7vZdvxZp81905v9zoW0Mw2tPqoNWie2LHyOI_-Nxu-r3urj3BLywt7FiZGlZoLHFi_2SgifrCqm1_3hwOr4Qf_fQNMIM_ayuZTVBXM46nULvhdrIevsp1LUQ",
  dq: "zUhmbCr_9N2PscKHMBG94I3XZaPJdsL5hJvXhHCBDE6vnJ6cyDG5H2SEAGaiJ7km39l6Ke9184Ev2ymdXPHB7WZ0vjNg9IPPkFiLgVbWxovZntQrzUtOkzxGPfntga4osRbg_nbxO_nv4REAO9aLurcgAIrYySuZQmV7Y1-nt9PGQsxfhRfjCquZjWkbgprDloqpG8DftuztXI21a952MGlNNjoOPWfSuZwzfNBucKZk30diT_bkY8j0ut7zUZWcn6NAykEd2PN9pAsclqnNEPwdKLB_Bt3NtR29xYhDl17xy7aXxQ5hN2Qiztwab9q_b5gCajkQSiL7HmSbGUUCwQ",
  qi: "ODvEylqBCSdyZ6EiPIpovv-mdn8J9xJOdqSry6uxfSyNvahqxpCBwLVGxZC3i_T8yRLdHaTgMEWDW8menacphGBF0cFTA8H7lNJVHWS_296Nf69sEct9n4yTetJPZFxGY0rnCamkjla7bHpkHPMKf-6GcimKQnDCvrk7XWORquElFxAH4iGf2lRMn-OQlaP9eoM1QvbTkSszTmL3Il_v35b1-83RvwF7gY-gGmvv60BYQs-1MrB4kkjxdSRWS7K-M0Rz_NQXFi63fO1_v0PVhG6Awc13TAQE1grzXrJN9CwHuKEAGdlzhea6JgMcqH2pV8NOuGDg69LuBVDuGjtQ3w",
  alg: "RSA-OAEP-256",
};
const publicKey = {
  key_ops: ["encrypt"],
  ext: true,
  kty: "RSA",
  n: "wZQBp5vWiFTU9ORIzlySpULJQB7XuZIZ46CH3DKweg-eukKfU1YGX8H_aNLFzDThSR_Gv7xnZ2AfoN_-EAqrLGf0T310j-FfAbe5JUMvxrH02Zk5LhZw5tu5n4XEJRHIAqJPUy_0vFS4-zfmGLIDpDgidRFh8eg_ghTEkOWybe99cg2qo_sa1m-ANr5j4qzpUFnOjZwvaWyhmBdlu7gtOC15BRwBP97Rp0bNeGEulEpoxPtks8XjgWXJ4MM7L8m2SkyHOTKGrrTXmAStvlbolWnq27S1QqTznMec4s2r9pUpfNwQGbbi7xTruTic-_zuvcvYqJwx-mpG7EQrwNIFK2KvM1PogezS6_2zYRy2uQTqpsLTEsaP-o-J4cylWQ3fikGh2EShzVKhgr1DWOy2Bmv9pZq5C7R_5OpApfwvTt3lFAWFjOez0ggHM9UbuKuUNay_D4bTEOaupBzDbkrn1hymgFuQtO97Wh6bFQKTHqpFiEy-LbPkoTKq6K0wNzsTne8-laBOPpYzTgtV9V_XFnR7EjsAYOaqLYU2pnr8UrhcMqsY1AIQDWvKqKMzDo25g6wQFtYnKQ8xEnVC1pT2P4Dt3Fx4Y6Uzg866rifn7MRpZBfXc5vsOnN46rSQLksWJrt8noxEbBGzi7Qi67O9EE9gWYSW2vWp3N6v81Isx9k",
  e: "AQAB",
  alg: "RSA-OAEP-256",
};

async function encrypt(message) {
  const algo = {
    name: "RSA-OAEP",
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };
  let args = ["jwk", publicKey, algo, false, ["encrypt"]];
  const pubKeyAsCryptoKey = await webcrypto.subtle.importKey(...args);
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);
  args = ["RSA-OAEP", pubKeyAsCryptoKey, encodedMessage];
  const encryptedMessage = await webcrypto.subtle.encrypt(...args);
  return JSON.stringify(Array.from(new Uint8Array(encryptedMessage)));
}

/**
 * @param {Array<string>} input 2-item array
 */
function poseidonHash(input) {
  const [leftInput, rightInput] = input;
  const { witness, output } = zokProvider.computeWitness(poseidonHashArtifacts, [
    [leftInput, rightInput],
  ]);
  return output.replaceAll('"', "");
}

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

// Poseidon hash of every level of the merkle tree when all leaves are zeroed
const heightToZeroHash = {
  0: "14744269619966411208579211824598458697587494354926760081771325075741142829156",
  1: "7423237065226347324353380772367382631490014989348495481811164164159255474657",
  2: "11286972368698509976183087595462810875513684078608517520839298933882497716792",
  3: "3607627140608796879659380071776844901612302623152076817094415224584923813162",
  4: "19712377064642672829441595136074946683621277828620209496774504837737984048981",
  5: "20775607673010627194014556968476266066927294572720319469184847051418138353016",
  6: "3396914609616007258851405644437304192397291162432396347162513310381425243293",
  7: "21551820661461729022865262380882070649935529853313286572328683688269863701601",
  8: "6573136701248752079028194407151022595060682063033565181951145966236778420039",
  9: "12413880268183407374852357075976609371175688755676981206018884971008854919922",
  10: "14271763308400718165336499097156975241954733520325982997864342600795471836726",
  11: "20066985985293572387227381049700832219069292839614107140851619262827735677018",
  12: "9394776414966240069580838672673694685292165040808226440647796406499139370960",
  13: "11331146992410411304059858900317123658895005918277453009197229807340014528524",
  14: "15819538789928229930262697811477882737253464456578333862691129291651619515538",
  15: "19217088683336594659449020493828377907203207941212636669271704950158751593251",
  16: "21035245323335827719745544373081896983162834604456827698288649288827293579666",
  17: "6939770416153240137322503476966641397417391950902474480970945462551409848591",
  18: "10941962436777715901943463195175331263348098796018438960955633645115732864202",
  19: "15019797232609675441998260052101280400536945603062888308240081994073687793470",
  20: "11702828337982203149177882813338547876343922920234831094975924378932809409969",
  21: "11217067736778784455593535811108456786943573747466706329920902520905755780395",
  22: "16072238744996205792852194127671441602062027943016727953216607508365787157389",
  23: "17681057402012993898104192736393849603097507831571622013521167331642182653248",
  24: "21694045479371014653083846597424257852691458318143380497809004364947786214945",
  25: "8163447297445169709687354538480474434591144168767135863541048304198280615192",
  26: "14081762237856300239452543304351251708585712948734528663957353575674639038357",
  27: "16619959921569409661790279042024627172199214148318086837362003702249041851090",
  28: "7022159125197495734384997711896547675021391130223237843255817587255104160365",
  29: "4114686047564160449611603615418567457008101555090703535405891656262658644463",
  30: "12549363297364877722388257367377629555213421373705596078299904496781819142130",
  31: "21443572485391568159800782191812935835534334817699172242223315142338162256601",
};
/**
 * @param {Array<string>} leaves
 */
function getZeroedMerkleRoot(leaves) {
  // zeroed-out merkle tree
  let root = 0;
  const heightToHash = {}; // tree height to hash at that height for zeroed-out tree
  heightToHash["0"] = poseidonHash("0", "0");
  for (let i = 1; i < 32; i++) {
    const lastHash = heightToHash[`${i - 1}`];
    heightToHash[`${i}`] = poseidonHash(lastHash, lastHash);
  }
  return heightToHash;
}

async function testResidenceProofEndpoint() {
  // NOTE: Start both servers before running this test
  const creds = 2;
  const secret = "0x" + "11".repeat(16);
  // TODO: Get root
  const root = 1;
  // TODO: Get path
  const path = [0];
  const directionSelector = [true, false];
  const args = {
    creds: creds,
    secret: secret,
  };
  // NOTE: Use AWS KMS in production
  const encryptedArgs = await encrypt(JSON.stringify(args));
  const resp = await axios.get(
    `http://localhost:3000/proofs/addSmallLeaf?args=${encryptedArgs}`
  );
  console.log(JSON.stringify(resp.data));
}

// console.log(getZeroedMerkleRoot());

// IncrementalMerkleTree playground
// const tree = new IncrementalMerkleTree(poseidonHash, 32, "0", 2);
// tree.insert("1");
// const index = tree.indexOf("1");
// const proof = tree.createProof(index);
// // console.log(proof);
// const directionSelector = proof.pathIndices;
// const path = proof.siblings;
// console.log(path.length);

// TODO: Add endpoint for other Lobby3 proof (proving knowledge of preimage) and test it
