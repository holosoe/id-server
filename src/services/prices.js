import axios from "axios";

const ethereumCMCID = 1027;
const fantomCMCID = 3513;

const slugToID = {
  ethereum: ethereumCMCID,
  fantom: fantomCMCID,
};

async function getPrice(req, res) {
  try {
    const slug = req.query.slug;
    if (!slug) {
      return res.status(400).json({ error: "No slug provided." });
    }

    const id = slugToID[slug];

    const resp = await axios.get(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${id}`,
      {
        headers: {
          "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
          // "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    const price = resp?.data?.data?.[id]?.quote?.USD?.price;

    return res.status(200).json({
      price,
    });
  } catch (err) {
    console.log("getPrice: Error encountered (a)", err.message);
    console.log("getPrice: Error encountered (b)", err?.response?.data);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getPrice };
