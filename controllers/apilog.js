'use strict';

var ApiLog,
	log4js = require('log4js'),
	logger,

	bulk = [],
	bulkMaxLength = 200,
	saveLogTimeout;

function logIt(appid, rid, rstamp, method, data, stamp, ms, code, errmessage) {
	var obj = {
		app: appid, stamp: stamp, ms: ms,
		rid: rid, rstamp: rstamp,
		method: method, data: data,
		code: code
	};
	if (errmessage) {
		obj.error = errmessage;
	}
	bulk.push(obj);

	//Если размер планируемого к сохранению достиг максимального, сразу сохраняем и сбрасываем
	if (bulk.length === bulkMaxLength) {
		saveLog();
	}
}

function scheduleLogSave() {
	saveLogTimeout = setTimeout(saveLog, 1e3);
}
function saveLog() {
	clearTimeout(saveLogTimeout);
	if (bulk.length) {
		ApiLog.collection.insert(bulk, {forceServerObjectId: true, checkKeys: false}, function (err) {
			if (err) {
				logger.error(err);
			}
			scheduleLogSave();
		});
		bulk = []; //Сбрасываем массив
	} else {
		scheduleLogSave();
	}
}

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger('apilog.js');
	ApiLog = db.model('ApiLog');

	scheduleLogSave();
};
module.exports.logIt = logIt;