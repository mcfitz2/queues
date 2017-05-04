var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')

var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

MongoClient.connect("mongodb://db/dw").then((db) => {
    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "extract_moves" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "places",
                status: "starting"
            }));
            db.collection("moves_summaries").aggregate([{
                $unwind: "$segments"
            }, {
                $match: {
                    "segments.type": "place"
                }
            }, {
                $project: {
                    _id: 0,
                    type: "$segments.type",
                    startTime: "$segments.startTime",
                    endTime: "$segments.endTime",
                    place: "$segments.place",
                    userId: "$userId"
                }
            }, {
                $out: "places"
            }], (err, result) => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "places",
                    status: "done"
                }));
            });

        }
    });
});