console.error(`**************
WARNING: do not use paypal until you can prevent the user from using the same order ID to verify multiple government IDs
**************`)
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TX_VALUE = "0.01"; // How much user should have paid, in USD

async function getAccessToken(){
    const response = await axios.post(
        'https://api-m.paypal.com/v1/oauth2/token',
        new URLSearchParams({
            'grant_type': 'client_credentials'
        }),
        {
            auth: {
                username: process.env.PAYPAL_CLIENT_ID,
                password: process.env.PAYPAL_SECRET
            }
        }
    );
    return response?.data?.access_token;
}

// Gets whether a transaction has gone thru and is the correct amount, taking only transaction's ID as an argument
// NOTE: this does not check whether the user has minted a Holo using this transaction ID yet
async function getPaymentStatus(id){
    try {
        const accessToken = await getAccessToken();
        console.log("accessTokn", accessToken)
        const response = await axios.get(`https://api.paypal.com/v2/checkout/orders/${id}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const pu = response?.data?.purchase_units
        const amount = pu ? pu[0].amount : null;
        console.log(amount, amount?.currency_code, amount?.value)

        return (
            (response?.data?.intent === "CAPTURE") && 
            (response?.data?.status === "COMPLETED") &&
            (amount?.currency_code === "USD") &&
            (amount?.value === TX_VALUE)
        );
    } catch (e) {
        console.error("There was an error getting payment status", e)
        return false;
    }
    
}

// Example:
getPaymentStatus("45J379401A559562G").then(x=>console.log("payment status", x))


export { getAccessToken, getPaymentStatus }