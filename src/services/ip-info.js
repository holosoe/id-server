import axios from "axios";

async function getCountry(req, res) {
  try {
    const userIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    console.log('req.headers["x-forwarded-for"]', req.headers["x-forwarded-for"]);
    console.log("req.socket.remoteAddress", req.socket.remoteAddress);

    const resp = await axios.get(
      `https://ipapi.co/${userIp}/json?key=${process.env.IPAPI_SECRET_KEY}`
    );
    const country = resp?.data?.country_name;

    console.log("resp.data", resp.data);

    return res.status(200).json({
      country,
    });
  } catch (err) {
    console.log("GET ip-info/country: Error encountered (a)", err.message);
    console.log("GET ip-info/country: Error encountered (b)", err?.response?.data);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getCountry };
