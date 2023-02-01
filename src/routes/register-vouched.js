import express from "express";
import { getCredentialsV1, getCredentialsV2 } from "../services/register-vouched.js";

const routerV1 = express.Router();
const routerV2 = express.Router();

routerV1.get("/vouchedCredentials", getCredentialsV1);
routerV2.get("/vouchedCredentials", getCredentialsV2);

const routers = { routerV1, routerV2 };
export default routers;
