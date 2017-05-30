var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");
var request = require("request-promise-native");
var NodeGeocoder = require('node-geocoder');
var options = {
    provider: 'google',
    httpAdapter: 'https', // Default
    apiKey: process.env.GOOGLE_API_KEY, // for Mapquest, OpenCage, Google Premier
    formatter: null // 'gpx', 'string', ...
};

function setTimeoutPromise(func, timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            func().then((res) => {
                resolve(res);
            }).catch((err) => {
                reject(err);
            });
        }, timeout);
    });
}
var geocoder = NodeGeocoder(options);
client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

function overQuota() {
    return request({
        method: "GET",
        uri: "https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=" + process.env.GOOGLE_API_KEY,
        resolveWithFullResponse: true
    }).then((res) => {
        console.log("Current Quota Status", res.statusMessage);
        return setTimeoutPromise(function() {
            return request({
                method: "GET",
                uri: "https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=" + process.env.GOOGLE_API_KEY,
                resolveWithFullResponse: true
            }).then((res) => {
                console.log("Current Quota Status", res.statusMessage);
                return Promise.resolve(res);
            });
        }, 2000);
    });
}
MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return overQuota().then((res) => {
            return db.collection("trackpoints").find({
                address: {
                    $in: [undefined, null]
                }
            }).limit(2500).toArray();
        });
    }
    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "geocode",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point) => {
                    return geocoder.reverse(point).then((response) => {
                        delete response[0].latitude;
                        delete response[0].longitude;
                        delete response[0].provider;
                        return db.collection("trackpoints").update({
                            _id: point._id
                        }, {
                            $set: {
                                address: response[0]
                            }
                        });
                    }).catch((err) => {
                        Promise.resolve(err);
                    });
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "geocode",
                    status: "done"
                }));
            }).catch((err) => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "geocode",
                    status: "done"
                }));
                //console.log(err);
            });
        }
    });
});