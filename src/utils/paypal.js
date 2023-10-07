import axios from "axios";
import { payPalApiUrlBase } from "../constants/misc.js";

async function getAccessToken() {
  const url =
    process.env.NODE_ENV === "development"
      ? `${payPalApiUrlBase}/v1/oauth2/token`
      : `${payPalApiUrlBase}/v1/oauth2/token`;
  const data = new URLSearchParams({
    grant_type: "client_credentials",
  });
  const config = {
    auth: {
      username: process.env.PAYPAL_CLIENT_ID,
      password: process.env.PAYPAL_SECRET,
    },
  };
  const response = await axios.post(url, data, config);
  return response?.data?.access_token;
}

async function getOrder(id, accessToken) {
  const url =
    process.env.NODE_ENV === "development"
      ? `${payPalApiUrlBase}/v2/checkout/orders/${id}`
      : `${payPalApiUrlBase}/v2/checkout/orders/${id}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  };
  const resp = await axios.get(url, config);
  return resp.data;
}

async function getRefundDetails(id, accessToken) {
  const url =
    process.env.NODE_ENV === "development"
      ? `${payPalApiUrlBase}/v2/payments/refunds/${id}`
      : `${payPalApiUrlBase}/v2/payments/refunds/${id}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  };
  const resp = await axios.get(url, config);
  return resp.data;
}

export { getAccessToken, getOrder, getRefundDetails };
