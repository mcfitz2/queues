var express = require("express");
var myParser = require("body-parser");
var Moves = require("moves");
var request = require("request");
var async = require("async");
var moment = require("moment");
var app = express();
var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");
app.use(myParser.json());
var firstRun = true;
var mongo_url = "mongodb://db:27017/dw";

function mkDates(start) {
    //	console.log("input", start);
    start = moment.utc(start);
    var now = moment.utc();
    var weeks = [];
    var current = now;
    //	console.log(start, now);
    while (current > start) {
        var end = moment.utc(current);
        var begin;
        current.subtract(6, "day");
        if (current < start) {
            begin = start;
        } else {
            begin = new moment.utc(current);
        }
        if (begin < start) {
            begin = start;
        }
        if (begin.isSame(end)) {
            begin.subtract(1, "days");
        }
        weeks.push([begin.format("YYYYMMDD"), end.format("YYYYMMDD")]);
        current.subtract(1, "day");
    }
    return weeks;
}
MongoClient.connect(mongo_url, function(err, db) {
    function getMovesProfile(userId, callback) {
        console.log("Looking up user with userId", userId);
        //		db.collection("users").findOne({"credentials.moves.userId":userId}, function(err, user) {
        db.collection("users").findOne({}, function(err, user) {
            callback(err, user);
        });
    }

    function processDate(moves, user, date, callback) {
        console.log("Fetching", date);
        moves.get("/user/storyline/daily", {
            from: date[0],
            to: date[1],
            trackPoints: true
        }, function(err, res, days) {
            if (days) {
                async.eachLimit(days, 10, function(day, callback) {
                    day.userId = user._id;
                    db.collection("moves_summaries").update({
                        date: day.date
                    }, day, {
                        upsert: true
                    }, callback);
                }, callback);

            } else {
                console.log(err);
                callback(err, res);
            }
        });
    }

    function pullUser(userId, startDate, callback) {
        getMovesProfile(userId, function(err, profile) {
            var moves = new Moves({
                client_id: process.env.MOVES_CLIENT_ID,
                client_secret: process.env.MOVES_CLIENT_SECRET,
                access_token: profile.credentials.moves.access_token,
                refresh_token: profile.credentials.moves.refresh_token
            });
            var firstrun = process.env.FIRST_RUN == "TRUE";
            moves.get("/user/profile", {}, function(err, res, body) {
                console.log(err, body);
                if (firstrun) {
                    var dates = mkDates(body.profile.firstDate);
                } else {
                    var dates = mkDates(startDate);
                }
                async.eachLimit(dates, 2, function(date, callback) {
                    console.log(date);
                    async.retry({
                        times: 10,
                        interval: function(retryCount) {
                            return 50 * Math.pow(2, retryCount);
                        }
                    }, function(callback) {
                        processDate(moves, profile, date, callback);
                    }, function(err, res) {
                        callback(err, res);
                    });
                }, function(err) {
                    callback();
                });
            });
        });
    }

    app.post("/moves", function(request, response) {
        console.log("Got post", request.body);
        client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
            job_name: "extract_moves",
            status: "starting"
        }));

        var oldest = request.body.storylineUpdates.reduce(function(acc, curr, index, arr) {
            var date = moment.utc(curr.startTime);
            if (date.isBefore(acc)) {
                return date;
            } else {
                return acc;
            }
        }, moment());
        oldest.subtract(5, "days");
        pullUser(request.body.userId, oldest, function(err, result) {
            console.log(err, result);
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                job_name: "extract_moves",
                status: "done"
            }));
        });
        response.writeHead(200);
        response.end();
    });
    app.listen(8000);
});