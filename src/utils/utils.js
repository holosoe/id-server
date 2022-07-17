const web3 = require("web3");
const { ethers } = require("ethers");
// import { verifyMessage } from 'ethers/lib/utils'

module.exports.assertSignerIsAddress = async (message, signature, address) => {
  // const msgHash = web3.utils.sha3(message);
  let signer;
  try {
    // signer = ethers.utils.recoverAddress(msgHash, signature).toLowerCase();
    signer = ethers.utils.verifyMessage(message, signature);
  } catch (err) {
    console.log(err);
    console.log("Malformed signature");
  }
  return signer == address;
};

/**
 * Sign data with the server's private key
 */
module.exports.sign = async (data) => {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const signature = await wallet.signMessage(data);
  return signature;
};
