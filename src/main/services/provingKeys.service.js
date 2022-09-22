import express from "express";
import fs from "fs";
import config from "../../../config.js";

export async function onAddLeaf(req, res) {
  console.log(`${new Date().toISOString()} proving-keys/onAddLeaf: entered`);
  try {
    const file = fs.readFileSync(`${config.ZOK_DIR}/keys/onAddLeaf.proving.key.json`);
    const provingKey = JSON.parse(file.toString()).data;
    return res.status(200).json(provingKey);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "An error occurred" });
  }
}

export async function lobby3(req, res) {
  console.log(`${new Date().toISOString()} proving-keys/lobby3: entered`);
  try {
    const file = fs.readFileSync(
      `${config.ZOK_DIR}/keys/lobby3Proof.proving.key.json`
    );
    const provingKey = JSON.parse(file.toString()).data;
    return res.status(200).json(provingKey);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "An error occurred" });
  }
}
