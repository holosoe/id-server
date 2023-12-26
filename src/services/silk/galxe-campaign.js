import axios from "axios";
import peanut from "@squirrel-labs/peanut-sdk";
import { GalxeCampaignZeroUser } from "../../init.js";

const silkMfaServerOrigin =
  process.env.NODE_ENV === "production"
    ? "https://server.silkwallet.net"
    : "http://127.0.0.1:3003";

async function getSilkAccountFromGalxeAddress(address) {
  try {
    const resp = await axios.post(
      `${silkMfaServerOrigin}/galxe-campaigns/0/get-linked-account`,
      {
        address,
        api_key: process.env.SILK_MFASERVER_API_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  } catch (err) {
    if (err.response?.data) {
      console.error(err);
    } else if (err.request?.data) {
      console.error(err);
    } else {
      console.error(err);
    }
  }
}

async function getAllNfts(address) {
  const apiUrl = `https://deep-index.moralis.io/api/v2.2/${address}/nft`;

  const config = {
    headers: {
      accept: "application/json",
      "X-API-Key": process.env.MORALIS_API_KEY,
    },
    params: {
      chain: "optimism",
      format: "decimal",
      media_items: false,
    },
  };

  try {
    const response = await axios.get(apiUrl, config);
    const nfts = response.data.result;
    return nfts;
  } catch (error) {
    console.log("Error while fetching NFTs: ", error?.response?.data?.message);
  }
}

/**
 * ENDPOINT
 */
async function storePeanutData(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.SILK_ADMIN_API_KEY) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const generatedLink = req.body.generatedLink;
    const peanutLink = req.body.peanutLink;
    const email = req.body.email;

    if (!generatedLink) {
      return res.status(400).json({ error: "No generated link specified." });
    }

    if (!peanutLink) {
      return res.status(400).json({ error: "No peanut link specified." });
    }

    if (!email) {
      return res.status(400).json({ error: "No email specified." });
    }

    const newUser = new GalxeCampaignZeroUser({
      email,
      generatedLink,
      peanutLink,
    });
    await newUser.save();
    return res.status(200).json({
      message: `Created new user with email ${email}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT
 */
async function getUserHasClaimedNFT(req, res) {
  try {
    // The address the user is using with Galxe
    const galxeAddress = req.params.address;

    if (!galxeAddress) {
      return res.status(400).json({
        error: "No address specified",
      });
    }

    const silkAccount = await getSilkAccountFromGalxeAddress(galxeAddress);

    if (!silkAccount) {
      return res.status(400).json({
        error: "User's account isn't linked",
      });
    }

    const { _id: email, signer: silkAddress } = silkAccount;

    const user = await GalxeCampaignZeroUser.findOne({ email });

    if (!user || !user.generatedLink) {
      return res.status(400).json({
        error: "Peanut data not found for user",
      });
    }

    const linkDetails = await peanut.getLinkDetails({ link: user.peanutLink });

    if (!linkDetails.claimed) {
      return res.status(400).json({
        error: "Peanut link has not been claimed",
      });
    }

    return res.status(200).json({
      claimed: true,
    });

    // const nfts = await getAllNfts(silkAddress);

    // if ((nfts ?? []).length === 0) {
    //   return res.status(400).json({
    //     error: "User has no NFTs",
    //   });
    // }

    // const tokenAddress = linkDetails.tokenAddress.toLowerCase();
    // const tokenId = linkDetails.tokenId;

    // for (const nft of nfts) {
    //   if (
    //     tokenAddress === nft.token_address.toLowerCase() &&
    //     nft.token_id === tokenId
    //   ) {
    //     return res.status(200).json({
    //       claimed: true,
    //     });
    //   }
    // }

    // return res.status(400).json({
    //   error: "User has not claimed NFT",
    // });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { storePeanutData, getUserHasClaimedNFT };
