var express = require("express");
var passport = require("passport");
var session = require("express-session");
var mongoose = require("mongoose");
var flash = require('connect-flash');
var bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(session({
	secret: 'keyboard cat'
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.available_services = [
	'strava',
	'moves',
	'facebook',
	'twitter',
	'foursquare',
	'dropbox',
	'instagram'
];
app.set('view engine', 'html');
app.engine('html', require('hogan-express'));
app.set('views', __dirname + '/views');
var Service = mongoose.model("Service", new mongoose.Schema({
	name: {
		type: String,
		unique: true
	},
	access_token: String,
	refresh_token: String,
	service_user_id: String,
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User', //Edit: I'd put the schema. Silly me.
		required: true,
	}

}));

db = mongoose.connection;
db.on("error", function (err) {
	console.log(err);
});
db.once("open", function () {
	console.log(process.env);

	require("./lib/passport.js")(app, Service);
	require("./lib/routes.js")(app, Service);

	app.listen(process.env.PORT || 3000);

});
mongoose.connect(process.env.MONGO_URL);