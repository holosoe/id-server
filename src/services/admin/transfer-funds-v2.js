import { ethers } from "ethers";
import {
  ethereumProvider,
  optimismProvider,
  fantomProvider,
  avalancheProvider,
  auroraProvider,
  baseProvider,
  companyENS,
  companyAddressOP,
  companyAddressFTM,
  companyAddressAVAX,
  companyAddressBase,
  companyAddressAurora,
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
 * transferFundsV2 does swap with Uniswap to USDC before transferring
 */

// Universal Router and Permit2 Addresses
// reference: https://docs.uniswap.org/contracts/v3/reference/deployments/
// find pools here: https://app.uniswap.org/explore/pools/ look for v3 pool
// Contract Addresses per chain
const ADDRESSES = {
  ethereum: {
    // https://app.uniswap.org/explore/pools/ethereum/0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    SWAP_ROUTER02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
  },
  optimism: {
    // https://app.uniswap.org/explore/pools/optimism/0x1fb3cf6e48F1E7B10213E7b6d87D4c073C7Fdb7b
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    WETH: "0x4200000000000000000000000000000000000006",
    SWAP_ROUTER02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
  },
  base: {
    // https://app.uniswap.org/explore/pools/base/0xd0b53D9277642d899DF5C87A3966A349A798F224
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
    SWAP_ROUTER02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
  avalanche: {
    // https://app.uniswap.org/explore/pools/avalanche/0xfAe3f424a0a47706811521E3ee268f00cFb5c45E
    USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    WETH: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // This is WAVAX on Avalanche
    SWAP_ROUTER02: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
    // Note: On Avalanche, the native token is AVAX, not ETH
  },
  aurora: {
    // Empty pool on uniswap
    USDC: "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802",
    WETH: "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB", // This is WETH on Aurora
    // Note: Aurora supports both wrapped NEAR and wrapped ETH
  },
};

// v3 swaprouter is used, as v4 does not have a lot swap pools yet
// approval is not needed as we are doing doing swap from ETH
async function swapETHtoUSDC(wallet, amountInEth, recipientAddress, chain = 'mainnet') {
  // Add recipient parameter, defaulting to wallet address if not specified
  const recipient = recipientAddress || wallet.address;
  
  if (!wallet || !amountInEth) throw new Error("Missing wallet or amount");
  if (!ADDRESSES[chain]) throw new Error("Unsupported chain");

  const chainAddresses = ADDRESSES[chain];
  
  // Correct USDC address for the selected chain
  const USDC_ADDRESS = chainAddresses.USDC;
  
  console.log(`Swapping ${amountInEth} ETH to USDC on ${chain} using Uniswap V3 SwapRouter02...`);
  console.log(`WETH address: ${chainAddresses.WETH}`);
  console.log(`USDC address: ${USDC_ADDRESS}`);
  console.log(`Recipient address: ${recipient}`);
  
  // SwapRouter02 interface - added multicall and exactInputSingle functions
  const SWAP_ROUTER02_ABI = [
    "function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)",
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function unwrapWETH9(uint256 amountMinimum, address recipient) external payable"
  ];
  
  const swapRouter = new ethers.Contract(
    chainAddresses.SWAP_ROUTER02,
    SWAP_ROUTER02_ABI,
    wallet
  );

  const amountIn = ethers.utils.parseEther(amountInEth.toString());
  
  try {
    // Check wallet balance to ensure sufficient funds
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} ETH`);
    
    // Try multiple fee tiers if necessary
    // usually it is 0.05% but just in case
    const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    let error = null;
    
    for (const feeTier of feeTiers) {
      try {
        console.log(`Attempting swap with fee tier: ${feeTier}`);
        
        // Using multicall is more efficient for complex operations
        // In this case, we'll call exactInputSingle and potentially unwrapWETH9
        const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
        
        // Encode the exactInputSingle call
        const exactInputSingleParams = {
          tokenIn: chainAddresses.WETH,
          tokenOut: USDC_ADDRESS,
          fee: feeTier,
          recipient: recipient,
          amountIn: amountIn,
          amountOutMinimum: 1, // Set a small minimum to prevent fails
          sqrtPriceLimitX96: 0 // No price limit
        };
        
        const exactInputSingleCall = swapRouter.interface.encodeFunctionData(
          "exactInputSingle",
          [exactInputSingleParams]
        );
        
        // Create multicall with just the exactInputSingle function
        const multicallData = [exactInputSingleCall];
        
        // Execute the multicall with value equal to amountIn
        const tx = await swapRouter.multicall(
          deadline,
          multicallData,
          { 
            value: amountIn, 
            gasLimit: 300000
          }
        );
        
        console.log(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

        return receipt;
      } catch (tierError) {
        console.error(`Failed with fee tier ${feeTier}:`, tierError.message);
        error = tierError;
        // Continue to next fee tier
      }
    }
    
    // all fee tiers failed
    throw error || new Error("All fee tiers failed for swap");
    
  } catch (error) {
    console.error(`Swap failed on ${chain}:`);
    
    if (error.reason) {
      console.error(`Error reason: ${error.reason}`);
    }
    
    if (error.error && error.error.message) {
      console.error(`Error message: ${error.error.message}`);
    }
    
    throw error;
  }
}

async function transferFundsV2(req, res) {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  const txReceipts = {};

  try {
    const mainnetWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      ethereumProvider
    );
    const balanceMainnet = await mainnetWallet.getBalance();
    // If balance is less than 0.3 ETH, don't transfer. Otherwise, send 0.25 ETH.
    // We keep some ETH to pay for refunds.
    if (balanceMainnet.gte(ethers.utils.parseEther("0.3"))) {
      txReceipts["ethereum"] = await swapETHtoUSDC(
        mainnetWallet,
        0.25,
        companyENS,
        "ethereum"
      );
    }

    // Transfer ETH on Optimism \\
    const optimismWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      optimismProvider
    );
    const balanceOptimism = await optimismWallet.getBalance();
    // If balance is less than 0.2 ETH, don't transfer. Otherwise, send 0.15 ETH.
    // We keep some ETH to pay for refunds.
    if (balanceOptimism.gte(ethers.utils.parseEther("0.2"))) {
      txReceipts["optimism"] = await swapETHtoUSDC(
        optimismWallet,
        0.15,
        companyAddressOP,
        "optimism"
      );
    }

    // Transfer ETH on Base \\
    const baseWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      baseProvider
    );
    const balanceBase = await baseWallet.getBalance();
    // If balance is less than 0.2 ETH, don't transfer. Otherwise, send 0.15 ETH.
    // We keep some ETH to pay for refunds.
    if (balanceBase.gte(ethers.utils.parseEther("0.4"))) {
      txReceipts["base"] = await swapETHtoUSDC(
        baseWallet,
        0.15,
        companyAddressBase,
        "base"
      );
    }

    // Transfer AVAX on Avalanche \\
    const avalancheWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      avalancheProvider
    );
    const balanceAvalanche = await avalancheWallet.getBalance();
    // If balance is less than 20 AVAX, don't transfer. Otherwise, send 15 AVAX.
    // We keep some AVAX to pay for refunds.
    if (balanceAvalanche.gte(ethers.utils.parseEther("20"))) {
      txReceipts["avalanche"] = await swapETHtoUSDC(
        avalancheWallet,
        15,
        companyAddressAVAX,
        "avalanche"
      );
    }

    // Transfer ETH on Aurora \\
    const auroraWallet = new ethers.Wallet(
      process.env.PAYMENTS_PRIVATE_KEY,
      auroraProvider
    );
    const balanceAurora = await auroraWallet.getBalance();
    // If balance is less than 0.2 ETH, don't transfer. Otherwise, send 0.15 ETH.
    // We keep some ETH to pay for refunds.
    // if (balanceAurora.gte(ethers.utils.parseEther("0.2"))) {
    //   txReceipts["aurora"] = await swapETHtoUSDC(
    //     auroraWallet,
    //     0.15,
    //     companyAddressAurora,
    //     "aurora"
    //   ); 
    // }

    return res.status(200).json(txReceipts);
  } catch (err) {
    console.log("transferFunds: Error encountered (a)", err.message);
    if (err?.response?.data)
      console.log("transferFunds: Error encountered (b)", err?.response?.data);
    else console.log("transferFunds: Error encountered (b)", err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { transferFundsV2 };
