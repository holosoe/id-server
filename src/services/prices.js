import { pinoOptions, logger } from "../utils/logger.js";
import { getLatestCryptoPrice } from "../utils/cmc.js";
import { slugToID } from "../constants/cmc.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /prices] ",
  base: {
    ...pinoOptions.base,
  },
});

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
        { error: err.response.data },
        "Error getting price from CMC"
      );
    } else if (err.request) {
      endpointLogger.error(
        { error: err.request.data },
        "Error getting price from CMC"
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

    const ids = [];
    for (let i = 0; i < slugs.length; i++) {
      const id = slugToID[slugs[i]];
      ids.push(id);
    }

    const resp = await getLatestCryptoPrice(ids.join(","));

    const price = {};

    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      const id = slugToID[slug];
      price[slug] = resp?.data?.data?.[id]?.quote?.USD?.price;
    }

    return res.status(200).json(price);
  } catch (err) {
    if (err.response) {
      endpointLogger.error(
        { error: err.response.data },
        "Error getting price from CMC"
      );
    } else if (err.request) {
      endpointLogger.error(
        { error: err.request.data },
        "Error getting price from CMC"
      );
    } else {
      endpointLogger.error({ error: err.message }, "Error getting price from CMC");
    }
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getPrice, getPriceV2 };
