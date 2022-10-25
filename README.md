Backend for Holonym's ID service.

## Requirements

- Node.js ^18.9.0
- ZoKrates ^8.0.2
- MySQL ^8.0.30
- Docker ^20.10.18

(Other versions might work too, but the above versions were the ones used for testing.)

## Local environment setup

### 1. Node.js

Use [nvm](https://github.com/nvm-sh/nvm#about) to use the correct Node version.

1.  Follow the instructions in the [nvm repo](https://github.com/nvm-sh/nvm#about) to install nvm.
2.  Install and use the correct version of Node.

        nvm install

### 2. Install Node dependencies

        npm install

### 3. Install ZoKrates

Follow [the instructions in the ZoKrates "Getting Started" page](https://zokrates.github.io/gettingstarted.html) to install ZoKrates.

### 4. Environment variables

#### Create .env files

Copy .env.example to .env.

        cp .env.example .env

You also need a .env.docker.dev file.

        cp .env .env.docker.dev

(We use a separate .env.docker.\<ENVIRONMENT> file for every environment we run.)

#### Set environment variables

All environment variables are already correctly set in the .env.example file for local development.

You must change the following variables.

        VOUCHED_PUBLIC_KEY
        VOUCHED_PRIVATE_KEY
        VOUCHED_SANDBOX_PUBLIC_KEY
        VOUCHED_SANDBOX_PRIVATE_KEY

### 5. Database setup

Run the MySQL Docker container.

        docker run --name id-server-mysql --network host -e MYSQL_ROOT_PASSWORD=root -d mysql

## Run

Ensure that the MySQL server is running and that environment variables are set.

Open a terminal window, navigate to the directory of this repo, and run:

        npm run start:dev

## Test

We use mocha for tests. Run tests with:

        npm test

## Serialization of credentials

At the end of the verification process, the user is given their credentials to store in their browser.

The following is the serialization scheme that our proofs will expect.

| Field         | Number of bytes | Additional info                                                                                           |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| `countryCode` | 2               | Each country is represented as a prime number.                                                            |
| `subdivision` | 2               | UTF-8.                                                                                                    |
| `completedAt` | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |
| `birthdate`   | 3               | 1st byte represents years since 1900. Bytes 2 and 3 represent number of days since beginning of the year. |

## UUID

UUID is hash(firstName + lastName + addressPostalCode + birthdate)
