const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/userModel');

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    console.log("Authenticating user with email:", email);
    const user = await User.findOne({ email });
    console.log("Passport User:", user);
    if (!user) {
      return done(null, false, { message: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    console.log("Password match:", isMatch);
    if (!isMatch) {
      return done(null, false, { message: 'Invalid credentials' });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('email');
    done(null, user);
  } catch (err) {
    done(err);
  }
}); 