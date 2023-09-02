import { ethers } from "ethers";
import { holonymAddresses } from "../../constants/misc.js";

const optimismProvider = new ethers.providers.AlchemyProvider(
  "optimism",
  process.env.ALCHEMY_APIKEY
);
const fantomProvider = new ethers.providers.JsonRpcProvider(
  `https://fantom-rpc.gateway.pokt.network/v1/lb/${process.env.POCKET_NETWORK_APIKEY}`
);

/**
 * Check blockchain for tx.
 * - Ensure recipient of tx is id-server's address.
 * - Ensure amount is > desired amount.
 * - Ensure tx is confirmed.
 */
async function validateTxForIDVSessionCreation(chainId, txHash) {
  let tx;
  if (chainId === 10) {
    tx = await optimismProvider.getTransaction(txHash);
  } else if (chainId === 250) {
    tx = await fantomProvider.getTransaction(txHash);
  }

  if (!tx) {
    return {
      status: 400,
      error: "Could not find transaction with given txHash",
    };
  }

  if (holonymAddresses.indexOf(tx.to.toLowerCase()) === -1) {
    return {
      status: 400,
      error: `Invalid transaction recipient. Recipient must be one of ${holonymAddresses.join(
        ", "
      )}`,
    };
  }

  let expectedAmount;
  if (chainId === 10) {
    // 0.003 ETH is about $5 at the time of this writing
    expectedAmount = ethers.utils.parseEther("0.003");
  } else if (chainId === 250) {
    // 43 FTM is about $5 at the time of this writing
    expectedAmount = ethers.utils.parseEther("43");
  }

  if (tx.value.lt(expectedAmount)) {
    return {
      status: 400,
      error: `Invalid transaction amount. Amount must be greater than ${expectedAmount.toString()} on chain ${chainId}`,
    };
  }

  if (!tx.blockHash || tx.confirmations === 0) {
    return {
      status: 400,
      error: "Transaction has not been confirmed yet.",
    };
  }

  // TODO: Check the database to ensure that this tx wasn't used to pay for
  // another session

  return {};
}

export { validateTxForIDVSessionCreation };
