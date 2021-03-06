// load all the things we need
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const LinkedInStrategy = require('passport-linkedin').Strategy;


// load up the user model
const User = require('../app/models/users').User;

const configAuth = require('./auth');
const toolbox = require('../toolbox/toolbox');

const argv = require('minimist')(process.argv.slice(2));

let callbackURLIdx = argv.dev ? 0 : 1;

// expose this function to our app using module.exports
module.exports = passport => {

    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and deserialize users out of session
    // High level user serialize/de-serialize configuration used for passport
    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    // used to deserialize the user
    passport.deserializeUser((id, done) => {
        User.findById(id).exec(done);
    });

    // =========================================================================
    // LOCAL SIGNUP ============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

    passport.use('local-signup', new LocalStrategy({
            // by default, local strategy uses username and password, we will override with email
            usernameField: 'email',
            passwordField: 'password',
            passReqToCallback: true // allows us to pass back the entire request to the callback
        },
        (req, email, password, done) => {
            // asynchronous
            // User.findOne wont fire unless data is sent back
            process.nextTick(() => {
                // Normalize name and enact server-side form validation since client scripts can be edited (Not so fast!)
                const name = toolbox.normalizeName(req.body.name);

                if (!toolbox.validateName(name) || !toolbox.validateEmail(email) || !toolbox.validatePassword(password)) {
                    return done(null, false, req.flash('signupMessage', 'Please fill in all the fields'));
                }
                // find a user whose email is the same as the forms email
                // we are checking to see if the user trying to login already exists
                User.findOne({'local.email': req.body.email}, (err, user) => {
                    // if there are any errors, return the error
                    if (err) {
                        err.status = 1000;
                        return done(err);
                    }

                    // check to see if there's already a user with that email
                    if (user)
                        return done(null, false, req.flash('signupMessage', 'That email is already taken.'));
                    else {

                        if (req.originalUrl !== '/connect/local') {
                            // if there is no user with that email
                            // create the user
                            const newUser = new User();

                            // set the user's local credentials
                            newUser.local.email = email;
                            newUser.local.password = newUser.generateHash(password);
                            newUser.local.name = name;
                            newUser.connected_accounts = 1;
                            newUser.registration_date = new Date();

                            // save the user
                            newUser.save(err => {
                                if (err) throw err;
                                return done(null, newUser);
                            });
                        } else {
                            user = req.user; // pull the user out of the session

                            // update the current users facebook credentials
                            user.local.email = email;
                            user.local.password = user.generateHash(password);
                            user.local.name = name;
                            user.connected_accounts++;

                            // save the user
                            user.save(err => {
                                if (err)
                                    throw err;
                                return done(null, user);
                            });
                        }

                    }

                });

            });

        }));

    // =========================================================================
    // LOCAL LOGIN =============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

    passport.use('local-login', new LocalStrategy({
            // by default, local strategy uses username and password, we will override with email
            usernameField: 'email',
            passwordField: 'password',
            passReqToCallback: true // allows us to pass back the entire request to the callback
        },
        (req, email, password, done) => { // callback with email and password from our form

            // find a user whose email is the same as the forms email
            // we are checking to see if the user trying to login already exists
            User.findOne({'local.email': email}, (err, user) => {
                // if there are any errors, return the error before anything else
                if (err)
                    return done(err);

                // if no user is found, return the message
                if (!user)
                    return done(null, false, req.flash('loginMessage', 'No user found.')); // req.flash is the way to set flashdata using connect-flash

                // if the user is found but the password is wrong
                if (!user.validPassword(password))
                    return done(null, false, req.flash('loginMessage', 'Oops! Wrong password.')); // create the loginMessage and save it to session as flashdata

                // all is well, return successful user
                return done(null, user);
            });

        }));

    passport.use('facebook', new FacebookStrategy({
            clientID: configAuth.facebookAuth.clientID,
            clientSecret: configAuth.facebookAuth.clientSecret,
            callbackURL: configAuth.facebookAuth.callbackURLs[callbackURLIdx],
            profileFields: ['id', 'emails', 'name'],
            passReqToCallback: true
        },

        // facebook will send back the token and profile
        (req, accessToken, refreshToken, profile, done) => {
            console.log('profile', profile); // debugging
            if (!profile.emails || !profile.emails.length)
                return done('No emails associated with this account!');

            // asynchronous
            process.nextTick(() => {

                if (!req.user) {

                    // find the user in the database based on their facebook id
                    User.findOne({'facebook.id': profile.id}, (err, user) => {

                        // if there is an error, stop everything and return that
                        // ie an error connecting to the database
                        if (err)
                            return done(err);

                        if (user)
                            return done(null, user);// if a user is found, log them in
                        else {
                            // if there is no user found with that facebook id, create them
                            const newUser = new User();

                            if (req.originalUrl !== '/profile')
                                newUser.connected_accounts = 1;
                            else
                                user.connected_accounts++;

                            // set all of the facebook information in our user model
                            newUser.facebook.id = profile.id; // set the users facebook id
                            newUser.facebook.token = accessToken; // we will save the token that facebook provides to the user
                            newUser.facebook.name = profile.name.givenName + ' ' + profile.name.familyName; // look at the passport user profile to see how names are returned
                            newUser.facebook.email = profile.emails[0].value; // facebook can return multiple emails so we'll take the first
                            newUser.facebook.picture = 'https://graph.facebook.com/' +
                                profile.id.toString() + '/picture?type=large';
                            newUser.registration_date = new Date();

                            // save our user to the database
                            newUser.save(err => {
                                if (err)
                                    throw err;

                                // if successful, return the new user
                                return done(null, newUser);
                            });
                        }

                    });
                } else {
                    // user already exists and is logged in, we have to link accounts
                    const user = req.user; // pull the user out of the session

                    // update the current users facebook credentials
                    user.facebook.id = profile.id;
                    user.facebook.token = accessToken;
                    user.facebook.name = profile.name.givenName + ' ' + profile.name.familyName;
                    user.facebook.email = profile.emails[0].value;
                    user.facebook.picture = 'https://graph.facebook.com/v2.8/' +
                        profile.id.toString() + '/picture?type=large';
                    user.connected_accounts++;

                    // save the user
                    user.save(err => {
                        if (err)
                            throw err;
                        return done(null, user);
                    });
                }
            });

        }));

    passport.use(new TwitterStrategy({

            consumerKey: configAuth.twitterAuth.consumerKey,
            consumerSecret: configAuth.twitterAuth.consumerSecret,
            callbackURL: configAuth.twitterAuth.callbackURLs[callbackURLIdx],
            includeEmail: true, // Only works if configure twitter app settings to allow permissions (A ToS and Privacy page were required)
            passReqToCallback: true
        },
        (req, token, tokenSecret, profile, done) => {

            // make the code asynchronous
            // User.findOne won't fire until we have all our data back from Twitter
            process.nextTick(() => {

                if (!req.user) {

                    User.findOne({'twitter.id': profile.id}, (err, user) => {

                        // if there is an error, stop everything and return that
                        // ie an error connecting to the database
                        if (err)
                            return done(err);
                        // if the user is found then log them in
                        if (user)
                            return done(null, user); // if a user is found, log them in
                        else {
                            // if there is no user, create them
                            const newUser = new User();

                            if (req.originalUrl !== '/profile')
                                newUser.connected_accounts = 1;
                            else
                                user.connected_accounts++;

                            // set all of the user data that we need
                            newUser.twitter.id = profile.id;
                            newUser.twitter.token = token;
                            newUser.twitter.username = profile.username;
                            newUser.twitter.displayName = profile.displayName;
                            newUser.twitter.email = profile.emails[0].value;
                            newUser.twitter.picture = 'https://twitter.com/' + profile.username + '/profile_image?size=original';
                            newUser.registration_date = new Date();

                            // save our user into the database
                            newUser.save(err => {
                                if (err)
                                    throw err;
                                return done(null, newUser);
                            });
                        }
                    });
                } else {
                    // user already exists and is logged in, we have to link accounts
                    const user = req.user; // pull the user out of the session

                    // update the current users twitter credentials
                    user.twitter.id = profile.id;
                    user.twitter.token = token;
                    user.twitter.displayName = profile.displayName;
                    user.twitter.username = profile.username;
                    user.twitter.email = profile.emails[0].value;
                    user.twitter.picture = 'https://twitter.com/' + profile.username + '/profile_image?size=original';
                    user.connected_accounts++;

                    // save the user
                    user.save(err => {
                        if (err)
                            throw err;
                        return done(null, user);
                    });
                }
            });

        }));

    passport.use(new GoogleStrategy({

            clientID: configAuth.googleAuth.clientID,
            clientSecret: configAuth.googleAuth.clientSecret,
            callbackURL: configAuth.googleAuth.callbackURLs[callbackURLIdx],
            passReqToCallback: true
        },
        (req, token, refreshToken, profile, done) => {

            // make the code asynchronous
            // User.findOne won't fire until we have all our data back from Google
            process.nextTick(() => {

                if (!req.user) {

                    // try to find the user based on their google id
                    User.findOne({'google.id': profile.id}, (err, user) => {
                        if (err)
                            return done(err);

                        if (user)
                            return done(null, user); // if a user is found, log them in
                        else {
                            // if the user isnt in our database, create a new user
                            const newUser = new User();

                            if (req.originalUrl !== '/profile')
                                newUser.connected_accounts = 1;
                            else
                                user.connected_accounts++;

                            // set all of the relevant information
                            newUser.google.id = profile.id;
                            newUser.google.token = token;
                            newUser.google.name = profile.displayName;
                            newUser.google.email = profile.emails[0].value; // pull the first email
                            newUser.google.picture = profile.photos[0].value;
                            newUser.registration_date = new Date();

                            // save the user
                            newUser.save(err => {
                                if (err)
                                    throw err;
                                return done(null, newUser);
                            });
                        }
                    });
                } else {
                    // user already exists and is logged in, we have to link accounts
                    const user = req.user; // pull the user out of the session

                    // update the current users facebook credentials
                    user.google.id = profile.id;
                    user.google.token = token;
                    user.google.name = profile.displayName;
                    user.google.email = profile.emails[0].value;
                    user.google.picture = profile.photos[0].value.substring(0, profile.photos[0].value.length - 6);
                    user.connected_accounts++;

                    // save the user
                    user.save(err => {
                        if (err)
                            throw err;
                        return done(null, user);
                    });
                }
            });
        }));

    passport.use(new GitHubStrategy({
            clientID: configAuth.githubAuth.clientID,
            clientSecret: configAuth.githubAuth.clientSecret,
            callbackURL: configAuth.githubAuth.callbackURLs[callbackURLIdx],
            passReqToCallback: true
        },
        (req, accessToken, refreshToken, profile, done) => {
            process.nextTick(() => {

                if (!req.user) {

                    // try to find the user based on their google id
                    User.findOne({'github.id': profile.id}, (err, user) => {
                        if (err)
                            return done(err);

                        if (user)
                            return done(null, user); // if a user is found, log them in
                        else {
                            // if the user isn't in our database, create a new user
                            const newUser = new User();

                            if (req.originalUrl !== '/profile')
                                newUser.connected_accounts = 1;
                            else
                                user.connected_accounts++;

                            // set all of the relevant information
                            newUser.github.id = profile.id;
                            newUser.github.token = accessToken;
                            newUser.github.name = profile.displayName;
                            newUser.github.username = profile.username;
                            newUser.github.email = profile.emails[0].value;
                            newUser.github.email = profile._json.avatar_url;
                            newUser.registration_date = new Date();

                            // save the user
                            newUser.save(err => {
                                if (err)
                                    throw err;
                                return done(null, newUser);
                            });
                        }
                    });
                } else {
                    // user already exists and is logged in, we have to link accounts
                    const user = req.user; // pull the user out of the session

                    // update the current users facebook credentials
                    user.github.id = profile.id;
                    user.github.token = accessToken;
                    user.github.name = profile.displayName;
                    user.github.username = profile.username;
                    user.github.email = profile.emails[0].value;
                    user.github.picture = profile._json.avatar_url;
                    user.connected_accounts++;

                    // save the user
                    user.save(err => {
                        if (err)
                            throw err;
                        return done(null, user);
                    });
                }
            });
        }
    ));

    passport.use(new LinkedInStrategy({
        consumerKey: configAuth.linkedinAuth.clientID,
        consumerSecret: configAuth.linkedinAuth.clientSecret,
        callbackURL: configAuth.linkedinAuth.callbackURLs[callbackURLIdx],
        profileFields: ['id', 'first-name', 'last-name', 'email-address', 'headline', 'picture-url'],
        passReqToCallback: true
    }, (req, token, tokenSecret, profile, done) => {
        process.nextTick(() => {
            if (!req.user) {
                // try to find the user based on their linkedin id
                User.findOne({'linkedin.id': profile.id}, (err, user) => {
                    if (err)
                        return done(err);

                    if (user)
                        return done(null, user); // if a user is found, log them in
                    else {
                        // if the user isn't in our database, create a new user
                        const newUser = new User();

                        if (req.originalUrl !== '/profile')
                            newUser.connected_accounts = 1;
                        else
                            user.connected_accounts++;

                        // set all of the relevant information
                        newUser.linkedin.id = profile.id;
                        newUser.linkedin.token = token;
                        newUser.linkedin.name = profile.displayName;
                        newUser.linkedin.email = profile.emails[0].value;
                        newUser.linkedin.headline = profile._json.headline;
                        newUser.linkedin.picture = profile._json.pictureUrl;
                        newUser.registration_date = new Date();

                        // save the user
                        newUser.save(err => {
                            if (err)
                                throw err;
                            return done(null, newUser);
                        });
                    }
                });
            } else {
                // user already exists and is logged in, we have to link accounts
                const user = req.user; // pull the user out of the session

                // update the current users facebook credentials
                user.linkedin.id = profile.id;
                user.linkedin.token = token;
                user.linkedin.name = profile.displayName;
                user.linkedin.email = profile.emails[0].value;
                user.linkedin.headline = profile._json.headline;
                user.linkedin.picture = profile._json.pictureUrl;
                user.connected_accounts++;

                // save the user
                user.save(err => {
                    if (err)
                        throw err;
                    return done(null, user);
                });
            }
        })
    }));

};