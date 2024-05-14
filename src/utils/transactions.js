import { ethers } from "ethers";
import { idServerPaymentAddress } from "../../constants/misc.js";
import { usdToETH, usdToFTM, usdToAVAX } from "./cmc.js";

/**
 * Check blockchain for tx.
 * - Ensure recipient of tx is id-server's address.
 * - Ensure amount is > desired amount (within 5%).
 * - Ensure tx is confirmed.
 * - Ensure tx is on a supported chain.
 */
async function validateTxForSessionCreation(session, chainId, txHash, desiredAmount) {
  let tx = await getTransaction(chainId, txHash);

  if (!tx) {
    // Hacky solution, but sometimes a transaction is not found even though it exists.
    // Sleep for 5 seconds and try again.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    tx = await getTransaction(chainId, txHash);

    // If it's still not found, return an error.
    if (!tx) {
      return {
        status: 400,
        error: `Could not find transaction with txHash ${txHash}`,
      };
    }
  }

  const txReceipt = await tx.wait();

  if (idServerPaymentAddress !== tx.to.toLowerCase()) {
    return {
      status: 400,
      error: `Invalid transaction recipient. Recipient must be ${idServerPaymentAddress}`,
    };
  }

  // NOTE: This const must stay in sync with the frontend.
  // We allow a 5% margin of error.
  const expectedAmountInUSD = desiredAmount * 0.95;

  let expectedAmountInToken;
  if ([1, 10, 1313161554].includes(chainId)) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  } else if (chainId === 250) {
    expectedAmountInToken = await usdToFTM(expectedAmountInUSD);
  } else if (chainId === 43114) {
    expectedAmountInToken = await usdToAVAX(expectedAmountInUSD);
  }
  // else if (process.env.NODE_ENV === "development" && chainId === 420) {
  //   expectedAmount = ethers.BigNumber.from("0");
  // }
  else if (process.env.NODE_ENV === "development" && chainId === 420) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  }

  if (!txReceipt.blockHash || txReceipt.confirmations === 0) {
    return {
      status: 400,
      error: "Transaction has not been confirmed yet.",
    };
  }

  // Round to 18 decimal places to avoid this underflow error from ethers:
  // "fractional component exceeds decimals"
  const decimals = 18;
  const multiplier = 10 ** decimals;
  const rounded = Math.round(expectedAmountInToken * multiplier) / multiplier;

  const expectedAmount = ethers.utils.parseEther(rounded.toString());

  if (tx.value.lt(expectedAmount)) {
    return {
      status: 400,
      error: `Invalid transaction amount. Expected: ${expectedAmount.toString()}. Found: ${tx.value.toString()}. (chain ID: ${chainId})`,
    };
  }

  const sidDigest = ethers.utils.keccak256("0x" + session._id);
  if (tx.data !== sidDigest) {
    return {
      status: 400,
      error: "Invalid transaction data",
    };
  }

  return {};
}

export { validateTxForSessionCreation };
