
FROM node:10-alpine

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./

USER node

RUN npm install --production

COPY --chown=node:node . .

# To set the name/colour/port of the pages, PROD or TEST. Pass in as e.g. --build-arg env_label=TEST
ARG env_label=ENVIRONMENT
ARG env_colour=ENV_COLOUR
RUN for f in $(ls ui/*.html); do sed -i -e "s/ENVIRONMENT/$env_label/g" $f && sed -i -e "s/ENV_COLOUR/$env_colour/g" $f; done

EXPOSE 3004

CMD [ "node", "sbRestApiServer.js" ]
