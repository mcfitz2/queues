/**
 * Created by micahfitzgerald on 4/30/17.
 */
var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});
/** Converts numeric degrees to radians */
if (typeof(Number.prototype.toRadians) === "undefined") {
    Number.prototype.toRadians = function() {
        return this * Math.PI / 180;
    }
}

/** Converts numeric degrees to radians */
if (typeof(Number.prototype.toDegrees) === "undefined") {
    Number.prototype.toDegrees = function() {
        return this * 180 / Math.PI;
    }
}

function calcDistance(pointA, pointB) {
    var lat1 = pointA.lat;
    var lat2 = pointB.lat;
    var lon1 = pointA.lon;
    var lon2 = pointB.lon;
    var R = 6371e3; // metres
    var φ1 = lat1.toRadians();
    var φ2 = lat2.toRadians();
    var Δφ = (lat2 - lat1).toRadians();
    var Δλ = (lon2 - lon1).toRadians();

    var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    var d = R * c;
    return d;
}



function calcBearing(pointA, pointB) {
    let λ1 = pointA.lon.toRadians();
    let λ2 = pointB.lon.toRadians();
    let φ1 = pointA.lat.toRadians();
    let φ2 = pointB.lat.toRadians();
    var y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    var brng = Math.atan2(y, x).toDegrees();
    return brng;
}
MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return db.collection("trackpoints").find().sort({
            "time": 1
        }).toArray();
    }

    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "bearing",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point, index, arr) => {
                    if (index == arr.length - 1) {
                        return Promise.resolve(point);
                    } else {
                        let pointA = point;
                        let pointB = arr[index + 1];
                        point.bearing = calcBearing(pointA, pointB);
                        return db.collection("trackpoints").update({
                            _id: point._id
                        }, {
                            $set: {
                                bearing: point.bearing
                            }
                        })

                    }
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "bearing",
                    status: "done"
                }));
            });
        }
    });
});