var passport = require("passport");
var mongoose = require("mongoose");

function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated())
		return next();
	else
		res.redirect("login");
}
module.exports = function (app, Service) {
	app.post('/login',
		passport.authenticate('local'),
		function (req, res) {
			res.redirect('/');

		});
	app.get("/login", function (req, res) {
		res.render("login");
	});
	app.get('/auth/moves', ensureAuthenticated,
		passport.authorize(
			'moves', {
				scope: "location activity"
			})
	);
	app.get("/", ensureAuthenticated, function (req, res) {
		services = app.available_services.map(function (item) {
			return {
				name: item
			};
		});
		Service.find({}, function (err, saved) {
			for (var i = 0; i < saved.length; i++) {
				for (var j = 0; j < services.length; j++) {
					if (saved[i].name == services[j].name) {
						services[j].has_token = true;
					}
				}
			}
			console.log(services);
			res.locals.services = services;
			res.render("index");
		});

	});
	app.get('/auth/moves/callback', ensureAuthenticated,
		passport.authorize('moves', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});

	app.get('/auth/facebook', ensureAuthenticated,
		passport.authorize(
			'facebook', {
				//		    scope: "location activity"
				scope: "email,user_birthday,user_location,user_about_me,user_status"
			})
	);

	app.get('/auth/facebook/callback', ensureAuthenticated,
		passport.authorize('facebook', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});
	app.get('/auth/twitter', ensureAuthenticated,
		passport.authenticate(
			'twitter', {

			})
	);

	app.get('/auth/twitter/callback', ensureAuthenticated,
		passport.authenticate('twitter', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});

	app.get('/auth/strava', ensureAuthenticated,
		passport.authorize(
			'strava', {
				scope: "view_private,write"
			})
	);

	app.get('/auth/strava/callback', ensureAuthenticated,
		passport.authorize('strava', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});
	app.get('/auth/instagram', ensureAuthenticated,
		passport.authorize(
			'instagram', {})
	);

	app.get('/auth/instagram/callback', ensureAuthenticated,
		passport.authorize('instagram', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});

	app.get('/auth/foursquare', ensureAuthenticated,
		passport.authorize(
			'foursquare', {})
	);

	app.get('/auth/foursquare/callback', ensureAuthenticated,
		passport.authorize('foursquare', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});
	app.get('/auth/dropbox', ensureAuthenticated,
		passport.authorize(
			'dropbox', {})
	);

	app.get('/auth/dropbox/callback', ensureAuthenticated,
		passport.authorize('dropbox', {
			failureRedirect: '/'
		}),
		function (req, res) {
			res.redirect('/');
		});
	app.get("/get/:service", passport.authenticate("basic"), function (req, res) {
		Service.findOne({
			name: req.params.service,
			user: req.user._id,
		}, function (err, service) {
			if (service) {
				var response = {
					client_id: process.env[req.params.service + "_client_id"],
					client_secret: process.env[req.params.service + "_client_secret"],
					callback_url: process.env[req.params.service + "_callback_url"],
					name: service.name,
					access_token: service.access_token,
					refresh_token: service.refresh_token,
					service_user_id: service.service_user_id,
					user: service.user,
				};

				console.log(response);
				res.json(response);
			} else {
				res.sendStatus(404);
			}
		});
	});
};
