import { clientIDs } from "./constants.js"

// clientName = entity ID (the same as in the scope)
async function chargeClient(clientID, amount){
    assert(clientIDs.includes(clientID), "invalid clientID");
    // add clientID, amount to the database of charges. This database should automatically record the timestamp as well. If not, the timestamp should also be added here. Timestamp needs to be stored for invoicing purposes
    return "Not implemented yet"
}

export { chargeClient }