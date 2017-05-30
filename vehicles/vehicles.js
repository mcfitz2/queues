var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var auto = require("automatic");

var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function() {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

function flatten(arrays) {
    return [].concat.apply([], arrays);
}
MongoClient.connect("mongodb://db/dw").then((db) => {

    function getUsers() {
        return db.collection("users").find().toArray().then(function(users) {
            return Promise.all(users.map(function(user) {
                automatic = auto.createClient({
                    client_id: process.env.AUTOMATIC_CLIENT_ID,
                    client_secret: process.env.AUTOMATIC_CLIENT_SECRET,
                    access_token: user.credentials.automatic.access_token
                });
                return Promise.resolve({
                    user: user,
                    client: automatic
                });
            }));
        });
    }

    function getVehicles(obj) {
        return Promise.all(obj.map((obj) => {
            return obj.client.vehicles().then((res) => {
                obj.vehicles = res.body.results.map((vehicle) => {
                    vehicle.userId = obj.user._id;
                    return vehicle;
                });
                return Promise.resolve(obj)
            });
        }));
    }

    function getMileage(obj) {
        let vehicles = flatten(obj.map((obj) => {
            return obj.vehicles;
        }));
        return Promise.all(vehicles.map((vehicle) => {
            return new Promise((resolve, reject) => {
                db.collection("trips").aggregate([{
                        $match: {
                            vehicle_id: {
                                $eq: vehicle.id
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: "$distance_m"
                            }
                        }
                    }
                ], (err, result) => {
                    vehicle.distance_traveled = result[0].total;
                    resolve(vehicle);
                });
            });
        }));
    }

    function updateVehicles(vehicles) {
        return Promise.all(vehicles.map((vehicle) => {
            db.collection("vehicles").findOne({
                vehicle_id: vehicle.id
            }).then((vehicleDoc) => {

                if (vehicleDoc == null) {
                    vehicle.baseMileage = 0;
                } else {
                    vehicle.baseMileage = vehicleDoc.baseMileage;
                }
                vehicle.computedMileage = vehicle.distance_traveled / 1609.344;
                vehicle.odometer = vehicle.baseMileage + vehicle.computedMileage;
                vehicle.vehicle_id = vehicle.id;
                delete vehicle.id;
                delete vehicle.distance_traveled;
                delete vehicle.url;
                return db.collection("vehicles").update({
                    vehicle_id: vehicle.vehicle_id,
                    userId: vehicle.userId
                }, vehicle, {
                    upsert: true
                })
            });
        }));
    }

    client.on("message", function(topic, payload) {
        payload = JSON.parse(payload);
        if (payload.job_name == "extract_automatic" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "vehicles",
                status: "starting"
            }));

            getUsers()
                .then(getVehicles)
                .then(getMileage)
                .then(updateVehicles).then(function() {
                    client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                        job_name: "vehicles",
                        status: "done"
                    }));
                    console.log("done");
                });
        }
    });
});