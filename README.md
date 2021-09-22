# submissions-tracking-interface
An interface for browsing the ArrayExpress submissions tracking database

## Installation

Create envirnonment file, e.g. ".env", containing the DB connection details: <br>
AUTOSUBS_DB=*** <br>
AUTOSUBS_CUR_USERNAME=*** <br>
AUTOSUBS_CUR_PASSWORD=***

### Run locally with Docker
Commands:<br>
`docker build -t node-subs-interface-test .`<br>
`docker run --name node-subs-interface-test -p 3004:3004 --env-file .env node-subs-interface-test`

Then runs on localhost:3004

To update page names and colouring at run time use the following command: <br>
`docker run -d --name node-subs-interface-test -p 3004:3004 --env-file .env --entrypoint '/bin/sh' node-subs-interface-test -c 'cd /home/node/app; sed -i "s/ENVIRONMENT/TEST/g" ui/*.html && sed -i "s/ENV_COLOUR/#28B463/g" ui/*.html && node sbRestApiServer.js'`
