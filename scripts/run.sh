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

docker build -f Dockerfile.server -t id-server $REPO_DIR
printf "\n"
docker run --env-file $REPO_DIR/.env.docker.$TARGET_ENV -p 3000:3000 id-server
