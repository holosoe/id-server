import { HumanIDPaymentGateWhitelist } from '../../init.js'

async function getHumanIDPaymentgateWhitelistItem(req, res) {
  try {
    const { address, chain } = req.query;

    if (!address || !chain) {
      return res.status(400).json({ error: "Missing 'address' or 'chain' query param" });
    }

    const items = await HumanIDPaymentGateWhitelist.find()
    console.log('items', items) 
    const item = await HumanIDPaymentGateWhitelist.findOne({
      address: address.toLowerCase(),
      chain
    });

    return res.status(200).json({
      address: item?.address,
      chain: item?.chain,
      reason: item?.reason
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({ error: error.message });
  }
}

export {
  getHumanIDPaymentgateWhitelistItem
}
