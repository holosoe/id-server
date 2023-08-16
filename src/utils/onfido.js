import axios from "axios";

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
      `Error getting check with ID ${check_id}`,
      err.message,
      err.response?.data
    );
  }
}

export async function deleteOnfidoApplicant(applicant_id) {
  try {
    const resp = await axios.delete(
      `https://api.us.onfido.com/v3.6/applicants/${applicant_id}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.log(
      `Error deleting Onfido applicant with applicant_id ${applicant_id}`,
      err.message,
      err.response?.data
    );
  }
}
