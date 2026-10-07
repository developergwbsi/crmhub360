# Generado por bin/crmhub tenant:create - no editar a mano (se regenera con tenant:upgrade)
name: crmhub-${SLUG}

networks:
  crmhub_net:
    external: true
    name: crmhub_net

volumes:
  data:
    name: crmhub_${SLUG_U}_data
  custom:
    name: crmhub_${SLUG_U}_custom
  client_custom:
    name: crmhub_${SLUG_U}_client_custom

# EspoCRM 10: no montar /var/www/html completo; solo estos tres directorios
x-espo-volumes: &espo-volumes
  - data:/var/www/html/data
  - custom:/var/www/html/custom
  - client_custom:/var/www/html/client/custom

x-espo-env: &espo-env
  ESPOCRM_DATABASE_PLATFORM: Postgresql
  ESPOCRM_DATABASE_HOST: crmhub-postgres
  ESPOCRM_DATABASE_PORT: "5432"
  ESPOCRM_DATABASE_NAME: ${DB_NAME}
  ESPOCRM_DATABASE_USER: ${DB_USER}
  ESPOCRM_DATABASE_PASSWORD: ${DB_PASSWORD}
  ESPOCRM_ADMIN_USERNAME: admin
  ESPOCRM_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
  ESPOCRM_LANGUAGE: es_ES
  ESPOCRM_SITE_URL: ${SITE_URL}
  ESPOCRM_CONFIG_USE_WEB_SOCKET: "true"
  ESPOCRM_CONFIG_WEB_SOCKET_URL: ${WS_URL}
  ESPOCRM_CONFIG_WEB_SOCKET_ZERO_M_Q_SUBSCRIBER_DSN: "tcp://*:7777"
  ESPOCRM_CONFIG_WEB_SOCKET_ZERO_M_Q_SUBMISSION_DSN: "tcp://espocrm-websocket:7777"
  ESPOCRM_CONFIG_CRMHUB_SERVICE_URL: http://172.28.0.1:${HUB_PORT}
  ESPOCRM_CONFIG_CRMHUB_TENANT: ${SLUG}
  ESPOCRM_CONFIG_CRMHUB_HUB_TOKEN: ${HUB_TOKEN}

services:
  espocrm:
    image: espocrm/espocrm:latest
    container_name: crmhub-${SLUG}
    restart: unless-stopped
    environment: *espo-env
    volumes: *espo-volumes
    ports: ["127.0.0.1:${WEB_PORT}:80"]
    networks: [crmhub_net]

  espocrm-daemon:
    image: espocrm/espocrm:latest
    container_name: crmhub-${SLUG}-daemon
    restart: unless-stopped
    volumes: *espo-volumes
    environment: *espo-env
    entrypoint: docker-daemon.sh
    depends_on: [espocrm]
    networks: [crmhub_net]

  espocrm-websocket:
    image: espocrm/espocrm:latest
    container_name: crmhub-${SLUG}-websocket
    restart: unless-stopped
    volumes: *espo-volumes
    environment: *espo-env
    entrypoint: docker-websocket.sh
    depends_on: [espocrm]
    ports: ["127.0.0.1:${WS_PORT}:8080"]
    networks: [crmhub_net]
