var MongoClient = require('mongodb').MongoClient;
var mqtt = require('mqtt')
var elevation = require("elevation");
var client = mqtt.connect("mqtt://mqtt");

client.on('connect', function () {
    client.subscribe(process.env.MQTT_BASE_TOPIC);
});

MongoClient.connect("mongodb://db/dw").then((db) => {
	function getPoints() {
		return db.collection("trackpoints").find({elevation:{$in:[undefined, null]}}).toArray();
	}
    client.on("message", (topic, payload) => {
        payload = JSON.parse(payload);
        if (payload.job_name == "days_to_trackpoints" && payload.status == "done") {
            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"elevation", status:"starting"}));
		getPoints().then((points)=>{
			return Promise.all(points.map((point)=>{
				return new Promise((resolve, reject)=> {
					elevation.at(point.lat, point.lon, function(err, meters) {
						if (err) {reject(err); 
						} else {resolve(meters);}
					});
				}).then((meters)=> {
					return db.collection("trackpoints").update({_id:point._id}, {$set:{elevation:meters}});
				});
			}));
		}).then(()=>{
	            client.publish(process.env.MQTT_BASE_TOPIC, JSON.stringify({job_name:"elevation", status:"done"}));
		});
        }
    });
});

