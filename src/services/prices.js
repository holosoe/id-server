import { pinoOptions, logger } from "../utils/logger.js";
import { getLatestCryptoPrice } from "../utils/cmc.js";
import { slugToID } from "../constants/cmc.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /prices] ",
  base: {
    ...pinoOptions.base,
  },
});

// TODO: Use redis instead. This is a temporary solution to avoid hitting
// CMC's rate limit. key-value pair is { slug: { price: number, lastUpdatedAt: Date } }
const cryptoPrices = {};

async function getPrice(req, res) {
  try {
    const slug = req.query.slug;
    if (!slug) {
      return res.status(400).json({ error: "No slug provided." });
    }

    const id = slugToID[slug];

    const resp = await getLatestCryptoPrice(id);
    const price = resp?.data?.data?.[id]?.quote?.USD?.price;

    return res.status(200).json({
      price,
    });
  } catch (err) {
    if (err.response) {
      endpointLogger.error(
        { error: err.response.data, userReq: req },
        "Error getting price from CMC (getPrice v1)"
      );
    } else if (err.request) {
      endpointLogger.error(
        { error: err.request.data, userReq: req },
        "Error getting price from CMC (getPrice v1)"
      );
    } else {
      endpointLogger.error({ error: err.message }, "Error getting price from CMC");
    }
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function getPriceV2(req, res) {
  try {
    const slug = req.query.slug;
    if (!slug) {
      return res.status(400).json({ error: "No slug provided." });
    }

    const slugs = slug.split(",");

    // Check cache first
    const cachedPrices = {};
    const now = new Date();
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      const cachedPrice = cryptoPrices[slug];
      // If price was last updated less than 30 seconds ago, use cached price
      if (cachedPrice && now - cachedPrice.lastUpdatedAt < 30 * 1000) {
        cachedPrices[slug] = cachedPrice.price;
      }
    }

    // Get ids of cryptos whose prices weren't retrieved from cache
    const ids = [];
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      if (!cachedPrices[slug]) {
        ids.push(slugToID[slug]);
      }
    }

    if (ids.length === 0) {
      return res.status(200).json(cachedPrices);
    }

    const resp = await getLatestCryptoPrice(ids.join(","));

    const newPrices = {};

    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];

      // Ignore slugs whose prices were retrieved from cache
      if (cachedPrices[slug]) continue;

      const id = slugToID[slug];
      newPrices[slug] = resp?.data?.data?.[id]?.quote?.USD?.price;

      // Update cache
      cryptoPrices[slug] = {
        price: newPrices[slug],
        lastUpdatedAt: new Date(),
      };
    }

    return res.status(200).json({ ...newPrices, ...cachedPrices });
  } catch (err) {
    let errorObjStr = JSON.stringify(err);
    if (err.response) {
      endpointLogger.error(
        { error: err.response.data, userReq: req },
        "Error getting price from CMC:" + errorObjStr
      );
    } else if (err.request) {
      endpointLogger.error(
        { error: err.request.data, userReq: req },
        "Error getting price from CMC:" + errorObjStr
      );
    } else {
      endpointLogger.error({ error: err.message, userReq: req }, "Error getting price from CMC:" + errorObjStr);
    }
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getPrice, getPriceV2 };
