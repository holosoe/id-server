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

### MySQL Server

Start the MySQL server.

Create a database. Set `MYSQL_DB_NAME` in config.js to the name of the database hosted on the MySQL server (default: 'db').

### Redis Server

Start the redis server.

For production, the `REDIS_ENDPOINT` environment variable must be set. Do not include the port number. The port must be specified in config.js. It defaults to port 6379.

For local development, `REDIS_ENDPOINT` does not need to be set. You must run a redis server at localhost:6379. The easiest way to do this is with the redis docker image:

        docker run --network host redis

(Using `--network host` assumes you are not using your local redis for anything else.)

## Run

Ensure the database servers are running and environment variables are set.

**With Docker**

Open a terminal window, navigate to the directory of this repo, and run:

        npm run start:dev

**Without docker**

        npm run start

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

UUID is hash(firstName + lastName + addressPostalCode + birthdate)
