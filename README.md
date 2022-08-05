Backend for Lobby3 ID.

## Creds Serialization

Credentials are temporarilly stored plaintext in the `Users` table near the end of the verification process. At the end of the verification process, the user is given their credentials to store in their browser.

The following is the serialization scheme that our proofs will expect. User credentials must be converted to bytes on the frontend prior to proof generation.

| field           | number of bytes |
| --------------- | --------------- |
| `nameFirst`     | 14              |
| `lastName`      | 14              |
| `middleInitial` | 1               |
| `countryCode`   | 3               |
| `streetAddr1`   | 16              |
| `streetAddr2`   | 12              |
| `city`          | 16              |
| `subdivision`   | 2               |
| `postalCode`    | 8               |
| `completedAt`   | 3               |
| `birthdate`     | 3               |

## UUID

UUID is hash(firstName + middleInitial + lastName + addressStreet1 + addressStreet2 + addressCity + addressSubdivision + addressPostalCode + birthdate)
