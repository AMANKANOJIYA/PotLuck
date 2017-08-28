/**
 * Created by O on 10/21/2016.
 */
const path = require('path'); // Require path module for configuring paths
const bcrypt = require('bcrypt-nodejs'); // Require our encryption algorithm
const fs = require('fs'); // Require module for interacting with file system
const Grid = require('gridfs-stream'); // Require module for streaming files to and from MongoDB GridFS
const User = require('../app/models/users').User; // Require our user model
const Recipe = require('../app/models/recipes').Recipe; // Require of recipe model
const mongoose = require('mongoose'); // Require mongoose (used from GridFS connection)
const multer = require('multer'); // Require module for handling multipart form data (used for uploading files)
const upload = multer({dest: "./uploads"}); // Set upload location (destination)
const _ = require('underscore'); // Our JavaScript utility-belt (used for looping in our case)

const conn = mongoose.connection;
Grid.mongo = mongoose.mongo;
const gfs = Grid(conn.db);
const _viewsdir = appRoot + '/views';

module.exports = (app, passport) => {


    // Our homepage
    app.get('/', (req, res) => {
        res.render(path.resolve(_viewsdir + '/Home/intro.ejs')); // Render view
    });

    // Sign-in page/dashboard
    app.get('/index', (req, res) => {
        res.render(path.resolve(_viewsdir + '/Home/index.ejs'), { // Render view with given options
            loggedin: req.user !== undefined, // Check if user is logged in and pass the result to the client
            user: req.user // Pass the user model to the client
        });
    });

    app.get('/get_suggestions', isLoggedIn, (req, res) => {
        const uRecipeArr = []; // Final result array (User liked recipes with appended similarities)
        const recipeIds = []; // Array of liked recipes by current user stored by their ObjectIds
        let i = 0;

        // Loop through user feedback array and collect positively rated recipes
        _.each(req.user.local.feedback, f => {
            if (f.rating === 1) recipeIds[i++] = f.recipeId;
        });


        // Collect sorted list of recipes, projecting only their ids, titles, images, cooking time, and similarities
        // array
        Recipe.aggregate([{
            $project: {
                _id: 1,
                title: 1,
                image: 1,
                similarities: 1
            }
        }, {$sort: {_id: 1}}], (err, recipes) => {
            // Sort users liked recipes in ascending order to allow of O(n) time looping.
            recipeIds.sort((a, b) => a.toString().localeCompare(b.toString()));

            // Find similar recipes that match what the user liked. Similar recipes correspond to the id of the recipes
            // they are similar too.
            // TODO Use FindById to match recipes rather than manually looking it up (what is happening now)
            _.each(recipes, recipe => {
                if (recipeIds[i] !== undefined) { // Poor way of checking if out of array bounds
                    if (recipe._id.toString() === recipeIds[i].toString()) {  // Found match?
                        uRecipeArr[i] = recipe; // Collect the recipe with its related recipe array
                        i++;
                    }
                }
            });
            // Query database for full information (metadata) on acquired similar recipes (Returns top 3 similarities
            // of first liked recipe. Temporary solution. Needs to be more intelligent)
            Recipe.find({
                '_id': {
                    $in: [
                        uRecipeArr[0].similarities[1][0].id,
                        uRecipeArr[0].similarities[1][1].id,
                        uRecipeArr[0].similarities[1][2].id
                    ]
                }
            }, (err, docs) => {
                console.log(docs);

                // Return result to client
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(docs));
            })
        });
    });

    // Our sign-in page
    app.get('/login', (req, res) => {
        // render the page and pass in any flash data if it exists
        res.render(path.resolve(_viewsdir + '/Login/login.ejs'), {message: req.flash('loginMessage')});
    });

    // Process the login form
    app.post('/login', passport.authenticate('local-login', {
        successRedirect: '/polling', // redirect to the secure profile section
        failureRedirect: '/login', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // Our sign-up page
    app.get('/signup', (req, res) => {
        // render the page and pass in any flash data if it exists
        res.render(path.resolve(_viewsdir + '/Signup/signup.ejs'), {message: req.flash('signupMessage')});
    });

    // Process the signup form
    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect: '/polling', // redirect to the secure profile section
        failureRedirect: '/signup', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // Our profile page
    app.get('/profile', isLoggedIn, (req, res) => {
        const user_info = req.query.user_info; // Get url parameter value (Temporary testing parameter)

        // If value is 'true', return the skeleton of current user as JSON. Otherwise, render the user page
        if (user_info === "1") {
            User.findById(req.user._id, (err, profile) => {
                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify(profile, null, 3));
            });
        } else {
            res.render(path.resolve(_viewsdir + '/Profile/profile.ejs'), {
                user: req.user
            });
        }
    });

    // Displays list of registered users (for testing purposes)
    app.get('/user_list', isLoggedIn, (req, res) => {
        const xport = req.query.export;
        const userMap = {};
        let i = 0;
        if (xport) {
            User.find({}, {$project: {_id: 1, title: 1, image: 1}}, (err, user) => {

            })
        } else {
            User.find({}, (err, user) => {
                user.forEach(user => {
                    userMap[i++] = user;
                });
                res.setHeader('Content-Type', 'application/json');
                console.log(userMap);
                res.send(JSON.stringify(userMap, null, 3));
            })
        }
    });

    // route for facebook authentication and login
    app.get('/auth/facebook', passport.authenticate('facebook', {scope: ['email', 'public_profile']}));

    // handle the callback after facebook has authenticated the user
    app.get('/auth/facebook/callback',
        passport.authenticate('facebook', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // route for twitter authentication and login
    app.get('/auth/twitter', passport.authenticate('twitter'));

    // handle the callback after twitter has authenticated the user
    app.get('/auth/twitter/callback',
        passport.authenticate('twitter', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // route for google authentication and login
    app.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']}));

    // the callback after google has authenticated the user
    app.get('/auth/google/callback',
        passport.authenticate('google', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // route for github authentication and login
    app.get('/auth/github', passport.authenticate('github', {scope: ['user']}));

    // the callback after github has authenticated the user
    app.get('/auth/github/callback',
        passport.authenticate('github', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // Create a local account if previously set-up external account
    app.get('/connect/local', (req, res) => {
        res.render(path.resolve(_viewsdir + '/Login/connect-local.ejs'), {message: req.flash('loginMessage')});
    });

    // Process local account creation
    app.post('/connect/local', passport.authenticate('local-signup', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/connect/local', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    // send to facebook to do the authentication
    app.get('/connect/facebook', passport.authorize('facebook', {scope: 'email'}));

    // handle the callback after facebook has authorized the user
    app.get('/connect/facebook/callback',
        passport.authorize('facebook', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // send to twitter to do the authentication
    app.get('/connect/twitter', passport.authorize('twitter', {scope: ['email', 'public_profile']}));

    // handle the callback after twitter has authorized the user
    app.get('/connect/twitter/callback',
        passport.authorize('twitter', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // send to google to do the authentication
    app.get('/connect/google', passport.authorize('google', {scope: ['profile', 'email']}));

    // the callback after google has authorized the user
    app.get('/connect/google/callback',
        passport.authorize('google', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // send to google to do the authentication
    app.get('/connect/github', passport.authorize('github', {scope: ['user']}));

    // the callback after google has authorized the user
    app.get('/connect/github/callback',
        passport.authorize('github', {
            successRedirect: '/profile',
            failureRedirect: '/'
        }));

    // Unlink local account
    app.get('/unlink/local', (req, res) => {
        const user = req.user;
        user.local.password = undefined;
        user.local.email = undefined;
        user.save(err => {
            res.redirect('/profile');
        });
    });

    // Unlink facebook account
    app.get('/unlink/facebook', (req, res) => {
        const user = req.user;
        user.facebook.token = undefined;
        user.save(err => {
            res.redirect('/profile');
        });
    });

    // Unlink twitter account
    app.get('/unlink/twitter', (req, res) => {
        const user = req.user;
        user.twitter.token = undefined;
        user.save(err => {
            res.redirect('/profile');
        });
    });

    // Unlink google account
    app.get('/unlink/google', (req, res) => {
        const user = req.user;
        user.google.token = undefined;
        user.save(err => {
            res.redirect('/profile');
        });
    });

    // Unlink github account
    app.get('/unlink/github', (req, res) => {
        const user = req.user;
        user.github.id = undefined;
        user.save(err => {
            res.redirect('/profile');
        });
    });

    // Route for polling users on their food preferences
    app.get('/polling', isLoggedIn, (req, res) => {
        const version = req.query.version;

        // Collect single random recipe from the database, projecting only its id, title, and image
        // TODO To increase uniqueness of polling sample, increase sample size
        Recipe.aggregate({$sample: {size: 1}}, {$project: {_id: 1, title: 1, image: 1}}, (err, docs) => {
            if (err) console.log(err);
            if (version === 'v2') {
                res.setHeader('Content-Type', 'application/json');
                const target = {
                    "_id": docs[0]._id,
                    "title": docs[0].title,
                    "image": docs[0].image
                };
                console.log(target);
                res.send(JSON.stringify(target, null, 3));
            } else {
                res.render(path.resolve(_viewsdir + '/Polling/polling.ejs'), {
                    user: req.user,
                    recipe: docs
                });
            }
        });
    });

    // Process user feedback results
    app.post('/polling', isLoggedIn, (req, res) => {
        User.findByIdAndUpdate(req.user._id, {$push: {"local.feedback": req.body}}, {
            safe: true,
            upsert: true,
            new: true
        }, err => {
            if (err) return console.log(err);

            res.redirect('/polling');
        });
    });

    // Process user form submission
    app.post('/profile', isLoggedIn, (req, res) => {
        let target;
        const email = req.body.email;
        const name = req.body.name;
        if (req.body.pass > 0) {
            const password = generateHash(req.body.pass);

            target = {
                "local.email": email,
                "local.name": name,
                "local.password": password
            };
        }
        target = {
            "local.email": email,
            "local.name": name
        };

        User.findByIdAndUpdate(req.user._id, {$set: target}, {new: true}, err => {
            if (err) return console.log(err);
            console.log(target);
            console.log(req.user._id);
        });

        res.redirect('/profile');
    });

    // Route for privacy page
    app.get('/privacy_policy', (req, res) => {
        res.render(path.resolve(_viewsdir + '/Privacy/privacy.ejs'));
    });

    // Route for terms page
    app.get('/terms', (req, res) => {
        res.render(path.resolve(_viewsdir + '/Terms/terms.ejs'));
    });

    // Route for ending session
    app.get('/logout', (req, res) => {
        req.logout();
        res.redirect('/');
    });

    app.post('/profile/photo', isLoggedIn, upload.single('avatar'), (req, res) => {
        const writestream = gfs.createWriteStream({
            filename: req.file.originalname
        });
        fs.createReadStream('./uploads/' + req.file.filename)
            .on('end', () => {
                fs.unlink('./uploads/' + req.file.filename, err => {
                    res.redirect('/profile');
                })
            })
            .on('err', () => {
                res.send('Error uploading image')
            })
            .pipe(writestream);
        User.findByIdAndUpdate(req.user._id, {$set: {'local.picture': req.file.originalname}}, {new: true}, err => {
            if (err) return console.log(err);
        });
    });

    app.get('/profile/photo/:filename', isLoggedIn, (req, res) => {
        const readstream = gfs.createReadStream({filename: req.params.filename});
        readstream.on('error', err => {
            res.send('No image found with that title');
        });
        readstream.pipe(res);
    });

    app.get('/profile/photo/delete/:filename', isLoggedIn, (req, res) => {
        gfs.exist({filename: req.params.filename}, (err, found) => {
            if (err) return res.send('Error occured');
            if (found) {
                gfs.remove({filename: req.params.filename}, err => {
                    if (err) return res.send('Error occured');
                    User.findByIdAndUpdate(req.user._id, {$set: {'local.picture': undefined}}, {new: true}, err => {
                        if (err) return console.log(err);
                    });
                    res.redirect('/profile');
                });
            } else {
                res.send('No image found with that title');
            }
        });
    });
};

/**
 * Function for checking if the user requesting the page is logged in
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function isLoggedIn(req, res, next) {

    if (req.isAuthenticated())
        return next();

    res.redirect('/');
}

/**
 * Function for generating a hash
 * @param password Password to be hashed
 * @returns {*} Encrypted password
 */
function generateHash(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
}