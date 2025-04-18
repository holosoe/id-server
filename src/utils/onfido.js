import axios from "axios";
import { desiredOnfidoReports } from "../constants/onfido.js";

export async function createOnfidoApplicant() {
  try {
    const reqBody = {
      // From Onfido docs:
      // "For Document reports, first_name and last_name must be provided but can be
      // dummy values if you don't know an applicant's name."
      first_name: "Alice",
      last_name: "Smith",
      // NOTE: `location` is required for facial similarity reports.
      // NOTE: `consent` is required for US applicants. From Onfido docs: "If the location of
      // the applicant is the US, you must also provide consent information confirming that
      // the end user has viewed and accepted Onfido’s privacy notices and terms of service."
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/applicants",
      reqBody,
      config
    );
    return resp.data;
  } catch (err) {
    console.error("Error creating Onfido applicant", err.message, err.response?.data);
  }
}

/**
 * @param {string} [referrer] The match pattern URL. Defaults to Holonym frontend URL.
 */
export async function createOnfidoSdkToken(applicant_id, referrer) {
  try {
    if (!referrer) {
      referrer =
        process.env.NODE_ENV === "development"
          ? "http://localhost:3002/*"
          : "https://app.holonym.id/*";
    }
    // Create an SDK token for the applicant
    const body = `applicant_id=${applicant_id}&referrer=${referrer}`;
    const config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/sdk_token",
      body,
      config
    );
    return resp.data;
  } catch (err) {
    console.error("Error creating Onfido SDK token", err.message, err.response?.data);
  }
}

export async function createOnfidoCheck(applicant_id) {
  try {
    const reqBody = {
      applicant_id,
      report_names: desiredOnfidoReports,
      // applicant_provides_data: true,
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/checks",
      reqBody,
      config
    );
    return resp.data;
  } catch (err) {
    console.error("Error creating Onfido check",
      err.message,
      JSON.stringify(err.response?.data ?? {}, null, 2)
    );
    const details = err.response?.data?.error?.message ?? ''
    throw new Error("Error creating Onfido check" + ". " + details);
  }
}

/**
 * @param {string} check_id
 */
export async function getOnfidoCheck(check_id) {
  try {
    const resp = await axios.get(`https://api.us.onfido.com/v3.6/checks/${check_id}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    });
    return resp.data;
  } catch (err) {
    console.error(
      `Error getting check with ID ${check_id}`,
      err.message,
      err.response?.data
    );
  }
}

/**
 * @param {Array<string>} report_ids
 */
export async function getOnfidoReports(report_ids) {
  try {
    const reports = [];
    for (const report_id of report_ids) {
      const resp = await axios.get(
        `https://api.us.onfido.com/v3.6/reports/${report_id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
          },
        }
      );
      reports.push(resp.data);
    }
    return reports;
  } catch (err) {
    console.error(
      `Error getting reports. report_ids: ${report_ids}`,
      err.message,
      err.response?.data
    );
  }
}

export async function deleteOnfidoApplicant(applicant_id) {
  try {
    return await axios.delete(
      `https://api.us.onfido.com/v3.6/applicants/${applicant_id}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
        },
      }
    );
  } catch (err) {
    console.log(
      `Error deleting Onfido applicant with applicant_id ${applicant_id}`,
      err.message,
      err.response?.data
    );
  }
}
