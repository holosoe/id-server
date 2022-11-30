Backend for Holonym's ID service.

## Requirements

- Node.js ^18.9.0
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

### 3. Environment variables

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

### 4. Database setup

Run the MongoDB Docker container.

        docker run -d --network host --name id-server-mongo -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=password mongo

## Run

Ensure that the MongoDB database is running and that environment variables are set.

Open a terminal window, navigate to the directory of this repo, and run:

        npm run start:dev

## Test

We use mocha for tests. Run tests with:

        npm test
