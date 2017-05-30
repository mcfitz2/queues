var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");
var streetview = require("./streetview/index.js");
client.on('connect', function() {
   client.subscribe(process.env.MQTT_BASE_TOPIC);
});
var sv = new streetview({
    api_key: process.env.GOOGLE_API_KEY
});
MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return db.collection("trackpoints").find({
            $or: [{
                streetview: {
                    $exists: false
                }
            }, {
                streetview: null
            }],
            bearing: {
                $ne: null
            }
        }).limit(1000).toArray();
    }
    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "street-view",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point) => {
                    return sv.image({
                        size: [600, 600],
                        lat: point.lat,
                        lng: point.lon,
                        heading: point.bearing
                    }).then((image) => {
                        return db.collection("trackpoints").update({
                            _id: point._id
                        }, {
                            $set: {
                                streeview: image
                            }
                        });
                    });
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "street-view",
                    status: "done"
                }));
                db.close();
            });
        }
    });
});