var mongoose = require("mongoose"),
	bcrypt = require('bcrypt'),
	SALT_WORK_FACTOR = 10;
var userSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	},
	username: {
		type: String,
		required: true,
		index: {
			unique: true
		}
	},
	password: {
		type: String,
		required: true
	}
})
userSchema.pre('save', function (next) {
	var user = this;

	// only hash the password if it has been modified (or is new)
	if (!user.isModified('password')) return next();

	// generate a salt
	bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
		if (err) return next(err);

		// hash the password along with our new salt
		bcrypt.hash(user.password, salt, function (err, hash) {
			if (err) return next(err);

			// override the cleartext password with the hashed one
			user.password = hash;
			next();
		});
	});
});
userSchema.methods.comparePassword = function (candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
		if (err) return cb(err);
		cb(null, isMatch);
	});
};
var User = mongoose.model('User', userSchema);
module.exports = User;


if (module == require.main) {
	var read = require('read')

	var db = mongoose.connection;
	db.on('error', console.error);
	db.once('open', function () {
		console.log(process.argv)
		if (process.argv[2] == "adduser") {
			username = process.argv[3];
			name = process.argv[4];
			read({
				prompt: 'Password: ',
				silent: true
			}, function (er, password) {
				console.log('Your password is: %s', password)
				User.findOne({
					username: username
				}, function (err, user) {
					if (!user) {
						var u = new User({
							username: username,
							name: name,
							password: password,
						});
						u.save(function (err) {
							console.log("User created", err);
						});
					}
				});
			});
		}
	});
	mongoose.connect('mongodb://localhost/dw');

}
