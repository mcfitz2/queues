var MongoClient = require('mongodb').MongoClient;
var async = require("async");
var mqtt = require('mqtt')

var client  = mqtt.connect("mqtt://mqtt");
client.on('connect', function () {
  client.subscribe(process.env.MQTT_BASE_TOPIC);
});
MongoClient.connect("mongodb://db/dw", function(err, db) {
    if (err) {
        console.log(err);
        process.exit();
    }
    client.on('message', function (topic, payload) {
        payload = JSON.parse(payload);
        if (payload.job_name == "extract_moves" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"days_to_trackpoints", status:"starting"}));
            db.collection("moves_summaries").find({processed: {$in: [null, false]}}).toArray(function (err, results) {
                async.each(results, function (doc, callback) {
                    async.reduce(doc.segments, [], function (acc, segment, callback) {
                        if (segment.type == "move") {
                            acc.push(segment);
                        }
                        callback(null, acc);
                    }, function (err, segments) {
                        async.each(segments, function (segment, callback) {
                            async.each(segment.activities, function (activity, callback) {
                                async.each(activity.trackPoints, function (trackPoint, callback) {
                                    trackPoint.activity = activity.activity;
                                    trackPoint.userId = doc.userId;
                                    db.collection("trackpoints").update({time: trackPoint.time}, {$setOnInsert:trackPoint}, {upsert: true}, function (err, result) {
                                        callback(err);
                                    });
                                }, callback);
                            }, callback);
                        }, function (err) {
                            db.collection("moves_summaries").update({_id: doc._id}, {$set:{processed: true}}, function (err) {
                                callback(err);
                            });
                        });
                    });
                }, function (err) {
                    client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"days_to_trackpoints", status:"done"}));
                });
            });
        }
    });
});

