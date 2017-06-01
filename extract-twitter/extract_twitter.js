var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var client = mqtt.connect("mqtt://mqtt");
var Twitter = require('twitter');
var schedule = require('node-schedule');

MongoClient.connect("mongodb://db/dw").then((db) => {
    var j = schedule.scheduleJob('0 * * * *', function() {
        client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
            job_name: "extract_twitter",
            status: "starting"
        }));

        function getSinceId(user) {
            return db.collection("tweets").find({
                userId: user._id
            }).sort({
                id: -1
            }).limit(1).toArray().then((result) => {
                if (result.length > 0) {
                    return Promise.resolve(result[0].id_str);
                } else {
                    return Promise.resolve(1);
                }
            });
        }

        function getTweets(client, user, username, since_id, max_id) {
            var opts = {
                screen_name: username,
            }
            if (since_id != null && since_id > 0) {
                opts.since_id = since_id;
            }
            if (max_id != null && max_id > 0) {
                opts.max_id = max_id;
            }
            return new Promise((resolve, reject) => {
                client.get('statuses/user_timeline', opts, function(error, tweets, response) {
                    console.log(tweets.length + "tweets pulled");
                    if (error == null && tweets.length == 0) {
                        resolve();
                    } else {
                        Promise.all(tweets.map((tweet) => {
                            tweet.userId = user._id;
                            return db.collection("tweets").update({
                                id_str: tweet.id_str
                            }, tweet, {
                                upsert: true
                            });
                        })).then(() => {
                            var lowest = tweets.reduce((acc, tweet) => {
                                if (tweet.id < acc) {
                                    return tweet.id;
                                } else {
                                    return acc;
                                }
                            }, tweets[0].id);
                            resolve(getTweets(client, user, username, since_id, lowest));
                        });
                    }
                });
            });
        }
        db.collection("users").find().toArray().then((users) => {
            return Promise.all(users.map((user) => {
                return db.collection("services").findOne({
                    user: user._id,
                    name: "twitter"
                }).then((service) => {
                    var client = new Twitter({
                        consumer_key: process.env.twitter_client_id,
                        consumer_secret: process.env.twitter_client_secret,
                        access_token_key: service.access_token,
                        access_token_secret: service.refresh_token
                    });
                    return getSinceId(user).then((sinceId) => {
                        console.log(sinceId);
                        getTweets(client, user, service.service_user_name, sinceId, null).then(() => {
                            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({
                                job_name: "extract_twitter",
                                status: "done"
                            }));
                        });
                    });
                });
            }));
        });
    });
});