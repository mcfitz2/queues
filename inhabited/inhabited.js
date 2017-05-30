var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var inhabited = require("inhabited");
var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return db.collection("trackpoints").find({
            inhabited: undefined
        }).toArray();
    }
    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "inhabited",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point) => {
                    let inh = inhabited(point.lat, point.lon);
                    return db.collection("trackpoints").update({
                        _id: point._id
                    }, {
                        $set: {
                            inhabited: inh
                        }
                    });
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "inhabited",
                    status: "done"
                }));
            });
        }
    });
});