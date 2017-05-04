var express = require('express')
var bodyParser = require('body-parser')
var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");
var app = express()
app.use(bodyParser.json());
var ig = require('instagram-node').instagram();
ig.use({
    client_id: process.env.instagram_client_id,
    client_secret: process.env.instagram_client_secret
});
MongoClient.connect("mongodb://db/dw", function(err, db) {
    function getUser(instagramId, callback) {
        db.collection("users").findOne({}, function(err, user) {
            db.collection("services").findOne({user:user._id, name:"instagram"}, (err, service) => {
                user.access_token = service.access_token;
                callback(err, user);
            });
        });
    }

    function getMedia() {
        ig.user_self
        ig.user_self_media_recent({min_id:0}, function(err, medias, pagination, remaining, limit) {
            console.log(medias, pagination, remaining, limit);



        });
    }
    app.get("/webhook", function(req, res) {
        res.send(req.query["hub.challenge"]);
    });
    app.post("/webhook", function(req, res) {
        client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
            job_name: "extract_instagram",
            status: "starting"
        }));
        client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
            job_name: "extract_instagram",
            status: "done"
        }));
        res.send(200);
    });
    app.listen(8000, function() {
        ig.add_user_subscription('http://' + process.env.VIRTUAL_HOST + '/webhook', {}, function(err, result, remaining, limit) {
            getMedia();
        });
    });
});