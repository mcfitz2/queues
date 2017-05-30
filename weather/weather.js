var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var DarkSky = require("dark-sky");
var client = mqtt.connect("mqtt://mqtt");
var request = require("request-promise-native");
const forecast = new DarkSky(process.env.DARK_SKY_API_KEY);

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

function remainingAPICalls() {
    return request({
        method: "GET",
        uri: "https://api.darksky.net/forecast/" + process.env.DARK_SKY_API_KEY + "/37.8267,-122.4233",
        resolveWithFullResponse: true
    }).then((response) => {
        let left = 700 - response.headers['x-forecast-api-calls'];
        return Promise.resolve(left);
    });
}
MongoClient.connect("mongodb://db/dw").then((db) => {
    function getPoints() {
        return remainingAPICalls().then((left) => {
            if (left < 0) {
                return Promise.reject("No more requests today");
            } else {
                return db.collection("trackpoints").find({
                    weather: {
                        $in: [undefined, null]
                    }
                }).limit(left).toArray();
            }
        });
    }

    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "weather",
                status: "starting"
            }));
            getPoints().then((points) => {
                return Promise.all(points.map((point) => {
                    return forecast
                        .latitude(point.lat)
                        .longitude(point.lon)
                        .time(point.time)
                        .exclude("hourly,daily")
                        .units("us")
                        .language("en")
                        .get().then((weather) => {
                            return db.collection("trackpoints").update({
                                _id: point._id
                            }, {
                                $set: {
                                    weather: weather.currently
                                }
                            });
                        });
                }));
            }).then(() => {
                client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                    job_name: "weather",
                    status: "done"
                }));
            }).catch((err) => {
                console.log(err);
            });
        }
    });
});