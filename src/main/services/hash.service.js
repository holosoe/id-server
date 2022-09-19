import { poseidon } from "circomlibjs";

export async function poseidonEndpoint(req, res) {
  console.log(`${new Date().toISOString()} poseidonEndpoint: entered`);

  const args = req.body.args;
  if (!args) {
    return res.status(400).json({ error: `No arguments found in request body.` });
  }
  if (!Array.isArray(args)) {
    return res.status(400).json({ error: `args must be an array` });
  }

  try {
    const hash = poseidon(args);
    console.log(`${new Date().toISOString()} poseidonEndpoint: returning hash`);
    return res.status(200).json({ hash: hash.toString() });
  } catch (err) {
    console.log(err);
    console.log(
      `${new Date().toISOString()} poseidonEndpoint: error encountered during hash operation`
    );
    return res.status(400).json({ error: err.message });
  }
}
