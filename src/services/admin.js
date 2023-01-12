import { v4 as uuidV4 } from "uuid";
import { ProofClient, ProofSession } from "../init.js";
import { logWithTimestamp, hash } from "../utils/utils.js";
import { SALT, MAX_CLIENT_API_KEYS } from "../utils/constants.js";
import { startOfMonth } from "date-fns";
import { subMonths } from "date-fns";

async function login(req, res) {
  logWithTimestamp("GET /admin/auth: Entered");
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    logWithTimestamp("GET /admin/auth: API key not provided");
    return res.status(400).json({ error: "API key not provided" });
  }

  if (apiKey != process.env.ADMIN_PASSWORD) {
    logWithTimestamp("GET /admin/auth: API key not valid");
    return res.status(401).json({ error: "API key not valid" });
  }

  logWithTimestamp("GET /admin/auth: Login successful");
  return res.status(200).json({ data: "Login successful" });
}

async function getSessions(req, res) {
  logWithTimestamp("GET /admin/sessions: Entered");
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    logWithTimestamp("GET /admin/sessions: API key not provided");
    return res.status(400).json({ error: "API key not provided" });
  }

  if (apiKey != process.env.ADMIN_PASSWORD) {
    logWithTimestamp("GET /admin/sessions: API key not valid");
    return res.status(401).json({ error: "API key not valid" });
  }

  if (req.query.overview === "true") {
    const firstOfThisMonth = startOfMonth(new Date()).setUTCHours(0, 0, 0, 0);
    const firstOfLastMonth = subMonths(firstOfThisMonth, 1);

    const totalSessions = await ProofSession.countDocuments().exec();
    // "The $group stage has a limit of 100 megabytes of RAM. By default, if the stage
    // exceeds this limit, $group returns an error." - MongoDB docs.
    const totalSessionsByClientId = await ProofSession.aggregate([
      {
        $group: {
          _id: "$clientId",
          total: { $sum: 1 },
          totalThisMonth: {
            $sum: {
              // if createdAt >= 1st of this month, then 1, else 0
              $cond: [
                {
                  $gte: ["$createdAt", firstOfThisMonth],
                },
                1,
                0,
              ],
            },
          },
          totalLastMonth: {
            $sum: {
              // if createdAt >= 1st of last month and createdAt < 1st of this month,
              // then 1, else 0
              $cond: [
                {
                  $and: [
                    {
                      $gte: ["$createdAt", firstOfLastMonth],
                    },
                    {
                      $lt: ["$createdAt", firstOfThisMonth],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          clientId: "$_id",
          total: 1,
          totalThisMonth: 1,
          totalLastMonth: 1,
          _id: 0,
        },
      },
    ]);

    const overview = {
      total: totalSessions,
      totalByClientId: totalSessionsByClientId,
    };

    // get client usernames
    const clientIds = totalSessionsByClientId.map((session) => session.clientId);
    const clients = await ProofClient.find({ clientId: { $in: clientIds } });
    overview.totalByClientId.forEach((session) => {
      const client = clients.find((client) => client.clientId === session.clientId);
      session.username = client.username;
    });

    return res.status(200).json(overview);
  }

  if (req.query.clientId) {
    const result = await ProofSession.find({ clientId: req.query.clientId });
    const sessions = result.map((session) => session.toObject());
    sessions.sort((a, b) => {
      const aDate = new Date(a.createdAt);
      const bDate = new Date(b.createdAt);
      if (aDate.getFullYear() === bDate.getFullYear()) {
        return aDate.getMonth() - bDate.getMonth();
      }
      return aDate.getFullYear() - bDate.getFullYear();
    });
    sessions.forEach((session) => {
      delete session.consumedBy;
      delete session.clientId;
      delete session._id;
      delete session.__v;
    });
    return res.status(200).json(sessions);
  }
}

async function getClient(req, res) {
  logWithTimestamp("GET /admin/client: Entered");
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    logWithTimestamp("GET /admin/client: API key not provided");
    return res.status(400).json({ error: "API key not provided" });
  }

  if (apiKey != process.env.ADMIN_PASSWORD) {
    logWithTimestamp("GET /admin/client: API key not valid");
    return res.status(401).json({ error: "API key not valid" });
  }

  // TODO: Sanitize input

  if (!req.params.clientId) {
    logWithTimestamp("GET /admin/client: Client ID not provided");
    return res.status(400).json({ error: "Client ID not provided" });
  }

  const result = await ProofClient.findOne({ clientId: req.params.clientId });
  const client = result?.toObject();
  if (!client) {
    logWithTimestamp("GET /admin/client: Client not found");
    return res.status(404).json({ error: "Client not found" });
  }

  delete client._id;
  delete client.__v;
  delete client.apiKeys;
  delete client.passwordDigest;

  return res.status(200).json(client);
}

export { login, getSessions, getClient };
