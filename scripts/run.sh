#!/bin/bash

# Root directory of this project
REPO_DIR="$( cd "$( dirname "$0" )"/.. && pwd )"

USAGE="
Usage: $(basename "$0") [ENVIRONMENT]

Environments:
    dev (default)
    prod
"


TARGET_ENV=$1

if [[ -z $TARGET_ENV ]]; then
    TARGET_ENV="dev"
fi

if [[ "$TARGET_ENV" != "dev" && "$TARGET_ENV" != "prod" ]]; then
    echo "$USAGE";
    exit 1;
fi

PORT=3000
if [[ "$TARGET_ENV" == "dev" ]]; then
    PORT=3031
fi

docker build -f Dockerfile.server -t id-server --build-arg PORT=$PORT $REPO_DIR
printf "\n"
docker run --env-file $REPO_DIR/.env.docker.$TARGET_ENV -p $PORT:$PORT id-server
