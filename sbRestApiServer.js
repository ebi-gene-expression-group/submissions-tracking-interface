// Based on https://github.com/sbalagop/neo/blob/master/nserver.js
import express from 'express';
import bodyParser from 'body-parser';
import mysql from 'mysql';
import { formatInTimeZone } from 'date-fns-tz';
import yamljs from 'yamljs';
import dotenv from 'dotenv';

var app = express();
dotenv.config();

// Serve static files in 'ui' subdirectory of the directory in which this server is being run (i.e. the Submissions Tracking DB Home page)
app.use(express.static('ui'));

// Global variables
// Column headings in TSV output - corresponding to experimentsDBQuery
var experimentTSVFields =
    ['accession','user','directory','name','checker_score','atlas_status','in_curation','status','software','date_submitted','date_last_processed', 'version', 'curator','comment', 'file_validation_status', 'nextflow_run_id'];

var protocolsTSVFields =
    ['experiment_accession','protocol_accession','date_last_processed','type','user_accession','name','description','hardware','software'];

var todayTSVFields =
    ['accession', 'directory', 'name', 'checker_score', 'atlas_fail_score', 'in_curation', 'status', 'date_submitted', 'date_last_processed', 'curator', 'comment', 'file_validation_status', 'nextflow_run_id'];

var fastqValidationTSVFields =
    ['annotare_submission_id', 'date_last_processed', 'library_layout','annotare_file1_id', 'file1_name', 'annotare_file2_id','file2_name','status','comment'];

var fastqValidationAllStatiTSVFields =
    ['annotare_submission_id', 'experiment_accession', 'date_last_processed', 'library_layout','file1_name','file2_name', 'number_of_reads', 'quality_encoding', 'avg_read_length', 'status','comment'];


// NB. Outer join below includes special case experiments with no rows in data_files table, e.g. E-MTAB-5728
var experimentsDBQuery=
    "SELECT e.accession, u.login user, concat('MAGE-TAB_',e.id) directory, e.name, e.checker_score, e.atlas_fail_score atlas_status, " +
    "IF(e.in_curation=1,'yes','no') in_curation, e.status, e.software, " +
    "DATE_FORMAT(e.date_submitted, '%Y-%m-%d %H:%i') date_submitted, DATE_FORMAT(e.date_last_processed, '%Y-%m-%d %H:%i GMT') date_last_processed, " +
    "e.num_submissions version, " +
    "e.curator, REPLACE(e.comment,'\n','') comment, e.file_validation_status, nextflow_run_id " +
    "FROM experiments e " +
    "join users u on (e.user_id = u.id) " +
    "WHERE (e.is_deleted=0 and experiment_type='MAGE-TAB') " +
    "GROUP BY e.id " +
    "ORDER BY e.date_last_processed desc";

var protocolsDBQuery=
    "SELECT e.accession experiment_accession, p.accession protocol_accession, DATE_FORMAT(p.date_last_processed, '%Y-%m-%d %H:%i GMT') date_last_processed, " +
    "p.type, p.user_accession, p.name, p.description, p.hardware, p.software " +
    "FROM experiments e, protocol p, protocol2experiment p2e " +
    "WHERE e.is_deleted = 0 " +
    "AND p.date_last_processed >= NOW() - INTERVAL 2 YEAR " +
    "AND e.id = p2e.experiment_id " +
    "AND p.id = p2e.protocol_id " +
    "ORDER BY p.date_last_processed desc";

var protocolsByExperimentAccessionDBQuery=
    "SELECT e.accession experiment_accession, p.accession protocol_accession, DATE_FORMAT(p.date_last_processed, '%Y-%m-%d %H:%i GMT') date_last_processed, " +
    "p.type, p.user_accession, p.name, p.description, p.hardware, p.software " +
    "FROM experiments e, protocol p, protocol2experiment p2e " +
    "WHERE e.accession = ? " +
    "AND e.id = p2e.experiment_id " +
    "AND p.id = p2e.protocol_id " +
    "ORDER BY p.date_last_processed desc";

var todayDBQuery =
    "SELECT accession, concat('MAGE-TAB_', id) directory, name, checker_score, atlas_fail_score, " +
    "IF(in_curation=1,'yes','no') in_curation, status," +
    "DATE_FORMAT(date_submitted, '%Y-%m-%d %H:%i') date_submitted, DATE_FORMAT(date_last_processed, '%Y-%m-%d %H:%i GMT') date_last_processed, " +
    "curator, comment, file_validation_status, nextflow_run_id " +
    "FROM experiments " +
    "WHERE experiment_type='MAGE-TAB' AND date_last_processed >= NOW() - INTERVAL 1 DAY " +
    "ORDER BY date_last_processed desc";

var fastqValidationStatusQuery =
    "SELECT annotare_submission_id, DATE_FORMAT(date_last_processed, '%Y-%m-%d %H:%i') date_last_processed, " +
    "library_layout, annotare_file1_id, file1_name, annotare_file2_id, file2_name, " +
    "IF(status is not null, status, 'Queued') status, comment " +
    "FROM fastq_validation " +
    "WHERE annotare_submission_id = ? " +
    "ORDER BY library_layout, file1_name";

var fastqValidationAllStatiQuery =
    "SELECT annotare_submission_id, experiment_accession, DATE_FORMAT(date_last_processed, '%Y-%m-%d %H:%i') date_last_processed, " +
    "library_layout, file1_name, file2_name, " +
    "IF(status is not null, status, 'Queued') status, number_of_reads, quality_encoding, avg_read_length, comment " +
    "FROM fastq_validation " +
    "ORDER BY date_last_processed desc, annotare_submission_id desc, library_layout, file1_name asc";

// Function definitions
// Log any errors
function logError(err) {
    if (err) {
        console.error(err.message);
    }
}

// Handle DB connection or query error
function handleDBAccessError(res, err, format) {
    if (format === "json") {
	res.set('Content-Type', 'application/json');
            res.status(500).send(JSON.stringify({ status: 500, message: "DB access error:", detailed_message: err.message }));
    } else {
	res.set('Content-Type', 'text/plain');
	res.status(500).send("DB access error: " + err.message);
    }

   logError(err);
}

function returnResults(res, err, results, format, tsvFields) {
    if (format === "json") {
	res.set('Content-Type', 'application/json');
	if (err) {
           res.status(500).send(JSON.stringify({ status: 500, message: "Error retrieving results from DB:", detailed_message: err.message }));
        } else {
 	   res.status(200).send(JSON.stringify(results));
        }
    } else {
	res.set('Content-Type', 'text/plain');
	if (err) {
            res.status(500).send("Error retrieving results from DB: " + err.message);
	} else {
	    var rows = [];
	    results.forEach(function(result) {
		var row = [];
		tsvFields.forEach(function(entry) {
                    var val = result[entry];
		    if (entry == "date_last_processed") { // i.e. entry.startsWith("date")
                var dateTimeInCurrentTimeZone = formatInTimeZone(new Date(result[entry]), "Europe/London", 'yyyy-MM-dd HH:mm');
			row.push(dateTimeInCurrentTimeZone);
		    } else if (entry === "nextflow_run_id") {
                if(result[entry] != null && result[entry] != undefined){
                    var nextFlowRunURL = "https://cloud.seqera.io/orgs/aexpress/workspaces/aexpress_workspace/watch/" + result[entry];
                    var URLHTMLElelment = "<a href='" + nextFlowRunURL + "' target=\"_blank\">" + result[entry] + "</a>";
                    row.push(URLHTMLElelment);
                }else {
                    row.push("NA");
                }
            } else {
			row.push(val);
		    }
		});
		rows.push(row);
            });
	    var ret = {"data" : rows};
            res.status(200).send(ret);
	}
    }
}

function query_db(req, res, sqlQuery, params, format, tsvFields) {

  var dbDetailsArray = process.env.AUTOSUBS_DB.split(":");

  // Create connection
  var connection = mysql.createConnection({
      connectionLimit : 10,
      host     : dbDetailsArray[0],
      port     : dbDetailsArray[1],
      user     : process.env.AUTOSUBS_CUR_USERNAME,
      password : process.env.AUTOSUBS_CUR_PASSWORD,
      database : dbDetailsArray[2],
      debug    : false

  });

	// Connect to DB
	connection.connect(function(err){
	    if(err) {
		handleDBAccessError(res, err);
		return;
	    }
	});
	// Query the DB and return results
	connection.query(sqlQuery, params, function(err, results, fields) {
	    connection.end();
	    if (!err)
		returnResults(res, err, results, format, tsvFields);
	    else
		handleDBAccessError(res, err, format);
	});

}

// ********* REST API calls start here ***********

// Return all MTAB experiments
app.get('/mtab', function (req, res) {
    "use strict";

    query_db(req, res, experimentsDBQuery, [], 'text', experimentTSVFields)
});

// Return all protocols
app.get('/protocols', function (req, res) {
    "use strict";

    query_db(req, res, protocolsDBQuery, [], 'text', protocolsTSVFields)
});

// Return all protocols by experiment
app.get('/protocols/:EXPERIMENT_ACCESSION', function (req, res) {
    "use strict";

    query_db(req, res, protocolsByExperimentAccessionDBQuery, [req.params.EXPERIMENT_ACCESSION], 'text', protocolsTSVFields)
});

app.get('/today', function (req, res) {
    "use strict";

    query_db(req, res, todayDBQuery, [], 'text', todayTSVFields)
});

// Return FASTQ validation status for all libraries for annotare submission id
app.get('/fastq_validation/:ANNOTARE_SUBMISSION_ID', function (req, res) {
    "use strict";

    query_db(req, res, fastqValidationStatusQuery, [req.params.ANNOTARE_SUBMISSION_ID], 'json', fastqValidationTSVFields)
});

// Return FASTQ validation status for all libraries for annotare submission id
app.get('/fastq_validation', function (req, res) {
    "use strict";

    query_db(req, res, fastqValidationAllStatiQuery, [], 'text', fastqValidationAllStatiTSVFields)
});


var server = app.listen(process.env.SUBS_TRACKING_API_PORT, function () {
  "use strict";
  var host = server.address().address,
      port = server.address().port;
  console.log(' Server is listening at http://%s:%s', host, port);
});
