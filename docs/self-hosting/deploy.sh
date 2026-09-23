#!/bin/sh
# Se ejecuta en el servidor, invocado por el job de CD por SSH (o a mano para un rollback):
#   IMAGE_TAG=<git sha> ./deploy.sh
# El orden importa: primero las migraciones (rol propietario), luego la nueva versión de la app
# y por último una comprobación de salud. Si falla, el script sale con código distinto de cero
# y el job falla.
set -eu
cd "$(dirname "$0")"

: "${IMAGE_TAG:?IMAGE_TAG is required}"
export IMAGE_TAG
COMPOSE="docker compose -f compose.prod.yaml"

echo "Deploying ${IMAGE_TAG}"
$COMPOSE pull app migrate
$COMPOSE up -d db
$COMPOSE run --rm migrate
$COMPOSE up -d --wait --wait-timeout 120 app caddy

# Comprobación de salud a través del punto de entrada público (TLS + proxy + app + base de datos).
. ./.env
curl --fail --silent --show-error --max-time 10 "https://${SITE_DOMAIN}/health" > /dev/null
echo "${IMAGE_TAG}" > .deployed-tag
docker image prune -f > /dev/null
echo "Deployed ${IMAGE_TAG}"
