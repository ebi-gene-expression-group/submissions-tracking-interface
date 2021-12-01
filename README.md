# submissions-tracking-interface
An interface for browsing the ArrayExpress submissions tracking database

## Installation

Create envirnonment file, e.g. ".env", containing the DB connection details: <br>
```
AUTOSUBS_DB=*** <br>
AUTOSUBS_CUR_USERNAME=*** <br>
AUTOSUBS_CUR_PASSWORD=***
```

### Run locally with Docker
Commands:<br>
`docker build -t node-subs-interface-test .`<br>
`docker run --name node-subs-interface-test -p 3004:3004 --env-file .env node-subs-interface-test`

Then runs on localhost:3004

To update page names and colouring at run time use the following command: <br>
`docker run -d --name node-subs-interface-test -p 3004:3004 --env-file .env --entrypoint '/bin/sh' node-subs-interface-test -c 'cd /home/node/app; sed -i "s/ENVIRONMENT/TEST/g" ui/*.html && sed -i "s/ENV_COLOUR/#28B463/g" ui/*.html && node sbRestApiServer.js'`

### Run with Singularity 

Due to the read-only default nature of Singularity we need a workaround to pass the variables and modify the code at run time, e.g. to change the text and colour of the headers. 

Then environment file should contain the following variables:
```
AUTOSUBS_DB=***
AUTOSUBS_CUR_USERNAME=***
AUTOSUBS_CUR_PASSWORD=***

SUBS_TRACKING_API_PORT=3004

ENV_COLOUR=#28B463
ENV_NAME=TEST

RUN_DIR=/path/to/writable/directory/tmp_software_test
```

Create a run script to start the server which will be passed to the `singularity exec` command. 
```
#!/bin/sh

cd ${RUN_DIR}
cp -r /home/node/app/* ${RUN_DIR}
sed -i "s/ENVIRONMENT/${ENV_NAME}/g" ui/*.html
sed -i "s/ENV_COLOUR/${ENV_COLOUR}/g" ui/*.html
node sbRestApiServer.js
```

We will also need a directory outside the container that is writable. Create a directory there, one per instance, e.g. `tmp_software_test`.

Then the server can be started like this in the directory which has the env file and the run script: 
`singularity exec  --bind /path/to/writable/directory/  --contain --env-file /path/to/<env_file_name>  docker://quay.io/ebigxa/submissions-tracking-interface /path/to/<run_script_name> &`

Tested with singularity version 3.5.3
