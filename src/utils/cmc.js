import axios from "axios";

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
