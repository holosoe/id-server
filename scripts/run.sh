#!/bin/bash

# Root directory of this project
REPO_DIR="$( cd "$( dirname "$0" )"/.. && pwd )"

USAGE="
Usage: $(basename "$0") [ENVIRONMENT]

Environments:
    dev (default)
    alpha
    prod
"


TARGET_ENV=$1

if [[ -z $TARGET_ENV ]]; then
    TARGET_ENV="dev"
fi

if [[ "$TARGET_ENV" != "dev" && "$TARGET_ENV" != "alpha" && "$TARGET_ENV" != "prod" ]]; then
    echo "$USAGE";
    exit 1;
fi


docker build -f Dockerfile -t lobby3-id-server $REPO_DIR
printf "\n"
docker run -v $REPO_DIR/database:/app/database --env-file $REPO_DIR/.env.docker.$TARGET_ENV --network host lobby3-id-server
