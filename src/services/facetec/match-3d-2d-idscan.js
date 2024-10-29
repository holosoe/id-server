import axios from "axios";
import { ObjectId } from "mongodb";
import { Session } from "../../init.js";
import {
  sessionStatusEnum,
  facetecServerBaseURL,
} from "../../constants/misc.js";
import { pinoOptions, logger } from "../../utils/logger.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

export async function match3d2dIdScan(req, res) {
  try {
    const sid = req.body.sid;
    const faceTecParams = req.body.faceTecParams;

    if (!sid) {
      return res.status(400).json({ error: "sid is required" });
    }
    if (!faceTecParams) {
      return res.status(400).json({ error: "faceTecParams is required" });
    }

    // --- Validate id-server session ---
    let objectId = null;
    try {
      objectId = new ObjectId(sid);
    } catch (err) {
      return res.status(400).json({ error: "Invalid sid" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.IN_PROGRESS) {
      return res.status(400).json({ error: "Session is not in progress" });
    }

    // --- Forward request to FaceTec server ---

    let data = null;
    try {
      console.log('faceTecParams', faceTecParams)
      const resp = await axios.post(
        `${facetecServerBaseURL}/match-3d-2d-idscan`,
        faceTecParams,
        {
          headers: {
            "Content-Type": "application/json",
            'X-Device-Key': req.headers['x-device-key'],
            'X-User-Agent': req.headers['x-user-agent'],
            // TODO: facetec: create FACETEC_API_KEY env var
            // "X-Api-Key": process.env.FACETEC_API_KEY,
          },
        }
      )
      data = resp.data;  
    } catch (err) {
      // TODO: facetec: Look into facetec errors. For some, we
      // might want to fail the user's id-server session. For most,
      // we probably just want to forward the error to the user.

      if (err.request) {
        console.error('err.request')
        console.error(
          { error: err.request.data },
          "Error during facetec match-3d-2d-idscan"
        );

        return res.status(502).json({
          error: "Did not receive a response from the FaceTec server"
        })
      } else if (err.response) {
        console.error('err.response')
        console.error(
          { error: err.response.data },
          "Error during facetec match-3d-2d-idscan"
        );

        // TODO: facetec: We should probably forward the FaceTec server's
        // response verbatim, including status code.
        return res.status(502).json({
          error: "FaceTec server returned an error",
          data: err.response.data
        })
      } else {
        console.error('err')
        console.error({ error: err }, "Error during FaceTec match-3d-2d-idscan");
        return res.status(500).json({ error: "An unknown error occurred" });
      }
    }
    
    // console.log('facetec POST /match-3d-2d-idscan response:', data);

    // --- Forward response from FaceTec server ---

    if (data) return res.status(200).json(data);
    else return res.status(500).json({ error: "An unknown error occurred" });
  } catch (err) {
    console.log("POST /sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}
