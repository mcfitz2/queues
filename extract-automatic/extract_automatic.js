var express = require('express')
var bodyParser = require('body-parser')
var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var auto = require("automatic");
var async = require("async");

var client  = mqtt.connect("mqtt://mqtt");
var app = express()
app.use(bodyParser.json());


MongoClient.connect("mongodb://db/dw", function (err, db) {
    function getUser(automaticId, callback) {
        db.collection("users").findOne({}, function(err, user) {
			callback(err, user);
		});
    }
    app.post("/odometer", function (req, res) {
        client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"extract_automatic", status:"starting"}));
        let trip = req.body.trip;
        if (req.body.type == "trip:finished") {
            getUser(req.body.user.id, function(err, user) {
                var automatic = auto.createClient({
                    client_id: process.env.AUTOMATIC_CLIENT_ID,
                    client_secret: process.env.AUTOMATIC_CLIENT_SECRET,
                    access_token: user.credentials.automatic.access_token
                });
                automatic.trips({
                    started_at__gte: Math.floor(new Date(2017, 1, 28, 0, 0, 0).getTime() / 1000),
                    started_at__lte: Math.floor(new Date().getTime() / 1000),
                    page: 1,
                    limit: 250,
                    paginate: true
                }).then(function(results) {
                    var trips = [].concat.apply([], results.map(function(page) {
                        return page.body.results;
                    }));
                    console.log("Fetched", trips.length, "trips");
                    async.each(trips, function(trip, callback ){
                        trip.trip_id = trip.id;
                        delete trip.id;
                        trip.userId = user._id;
                        trip.vehicle_id = trip.vehicle.split("/")[4];
                        db.collection("trips").update({trip_id:trip.trip_id, userId:trip.userId}, trip, {upsert:true}, callback)
                    }, function(err) {
			            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"extract_automatic", status:"done"}));
                    });
                }).catch(function(err) {
                    console.log(err);
                });
            });
        }
        res.send(200);
    });


});

app.listen(8000);
