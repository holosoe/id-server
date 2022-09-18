Backend for Lobby3 ID.

## Requirements

- Node.js ^16.14.2
- Python ^3.10
- ZoKrates ^8.0.1

(Other versions might work too, but the above versions were the ones used for testing.)

## Environment Setup

TODO: Env vars

Use the correct node version. For nvm users...

        nvm use

Use the correct python version. For conda users...

    conda activate py3.10

## Serialization of Credentials

At the end of the verification process, the user is given their credentials to store in their browser.

The following is the serialization scheme that our proofs will expect. User credentials must be converted to bytes on the frontend prior to proof generation.

| Field         | Number of bytes | Additional info                                                                                           |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| `countryCode` | 2               | Each country is represented as a prime number.                                                            |
| `city`        | 18              | UTF-8. Right padded.                                                                                      |
| `subdivision` | 2               | UTF-8.                                                                                                    |
| `completedAt` | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |
| `birthdate`   | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |

## UUID

UUID is hash(firstName + middleInitial + lastName + addressStreet1 + addressStreet2 + addressCity + addressSubdivision + addressPostalCode + birthdate)
