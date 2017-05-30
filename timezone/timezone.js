var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var tzlookup = require("tz-lookup");
var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return db.collection("trackpoints").find({
            timezone: {
                $in: [undefined, null]
            }
        }).toArray();
    }

    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "timezone",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point) => {
                    let inh = tzlookup(point.lat, point.lon);
                    return db.collection("trackpoints").update({
                        _id: point._id
                    }, {
                        $set: {
                            timezone: inh
                        }
                    });
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "timezone",
                    status: "done"
                }));
            });
        }
    });
});