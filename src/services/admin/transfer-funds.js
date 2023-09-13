import { ethers } from "ethers";
import {
  optimismProvider,
  fantomProvider,
  companyAddressOP,
  companyAddressFTM,
} from "../../constants/misc.js";
import { pinoOptions, logger } from "../../utils/logger.js";

// const endpointLogger = logger.child({
//   msgPrefix: "[DELETE /admin/transfer-funds] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

/**
 * Endpoint to be called by daemon to periodically transfer funds from
 * id-server's account to the company's account.
 */
async function transferFunds(req, res) {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  const txReceipts = {};

  try {
    // Transfer ETH on Optimism \\
    const optimismWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      optimismProvider
    );
    const balanceOptimism = await optimismWallet.getBalance();
    // If balance is less than 0.5 ETH, don't transfer. Otherwise, send 0.4 ETH.
    // We keep some ETH to pay for refunds.
    if (balanceOptimism.gte(ethers.utils.parseEther("0.5"))) {
      const tx = await optimismWallet.sendTransaction({
        to: companyAddressOP,
        value: ethers.utils.parseEther("0.4"),
      });

      txReceipts["optimism"] = await tx.wait();
    }

    // Transfer FTM on Fantom \\
    const fantomWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      fantomProvider
    );
    const balanceFantom = await fantomWallet.getBalance();

    // If balance is less than 5k FTM, don't transfer. Otherwise, send 4k FTM.
    // We keep some FTM to pay for refunds.
    if (balanceFantom.gte(ethers.utils.parseEther("5000"))) {
      const tx = await fantomWallet.sendTransaction({
        to: companyAddressFTM,
        value: ethers.utils.parseEther("4000"),
      });

      txReceipts["fantom"] = await tx.wait();
    }

    return res.status(200).json(txReceipts);
  } catch (err) {
    console.log("transferFunds: Error encountered (a)", err.message);
    if (err?.response?.data)
      console.log("transferFunds: Error encountered (b)", err?.response?.data);
    else console.log("transferFunds: Error encountered (b)", err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { transferFunds };
