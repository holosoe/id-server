import axios from "axios";
import { ethereumCMCID, fantomCMCID, avalancheCMCID } from "../constants/cmc.js";

/**
 * Get price of the crypto designated by the given CMC ID.
 */
export function getLatestCryptoPrice(id) {
  return axios.get(
    `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${id}`,
    {
      headers: {
        "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
        Accept: "application/json",
      },
    }
  );
}

export async function usdToETH(usdAmount) {
  const resp = await getLatestCryptoPrice(ethereumCMCID);
  const ethPrice = resp?.data?.data?.[ethereumCMCID]?.quote?.USD?.price;
  const ethAmount = usdAmount / ethPrice;
  return ethAmount;
}

export async function usdToFTM(usdAmount) {
  const resp = await getLatestCryptoPrice(fantomCMCID);
  const fantomPrice = resp?.data?.data?.[fantomCMCID]?.quote?.USD?.price;
  const ftmAmount = usdAmount / fantomPrice;
  return ftmAmount;
}

export async function usdToAVAX(usdAmount) {
  const resp = await getLatestCryptoPrice(avalancheCMCID);
  const avalanchePrice = resp?.data?.data?.[avalancheCMCID]?.quote?.USD?.price;
  const ftmAmount = usdAmount / avalanchePrice;
  return ftmAmount;
}
