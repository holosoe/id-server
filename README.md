Backend for Lobby3 ID.

## Requirements

Option 1:

- Docker ^20.10.18

Option 2:

- Node.js ^18.9.0
- ZoKrates ^8.0.2
- MySQL ^8.0.30
- Redis ^7.0.5

(Other versions might work too, but the above versions were the ones used for testing.)

## Environment Setup

Copy .env.example to .env, and then set the environment variables.

        cp .env.example .env

You will need to create a .env.docker.ENVIRONMENT file for every environment you want to run. For a local development environment, create the following file.

        cp .env .env.docker.dev

Then set `ENVIRONMENT` to `dev`.

Use the correct node version. For nvm users...

        nvm use

## Database Setup

Start the MySQL server.

Create a database. Set `MYSQL_DB_NAME` in config.js to the name of the database hosted on the MySQL server (default: 'db').

## Run

First, start the redis cache. (Using `--network host` assumes you are not using your local redis for anything else.)

        docker run --network host redis

Open a separate terminal, navigate to the directory of this repo, and run:

        npm run start:dev

## Serialization of Credentials

At the end of the verification process, the user is given their credentials to store in their browser.

The following is the serialization scheme that our proofs will expect. User credentials must be converted to bytes on the frontend prior to proof generation.

| Field         | Number of bytes | Additional info                                                                                           |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| `countryCode` | 2               | Each country is represented as a prime number.                                                            |
| `subdivision` | 2               | UTF-8.                                                                                                    |
| `completedAt` | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |
| `birthdate`   | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |

## UUID

UUID is hash(firstName + middleInitial + lastName + addressStreet1 + addressStreet2 + addressCity + addressSubdivision + addressPostalCode + birthdate)
