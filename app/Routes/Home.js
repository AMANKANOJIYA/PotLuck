/**
 * Created by yazan on 5/16/2017.
 */

const _viewsdir = appRoot+'/views';
const _modelsdir = appRoot + '/app/models';

var _ = require('underscore'); // Our JavaScript utility-belt (used for looping in our case)
var path = require('path'); // Require path module for configuring paths
var bcrypt = require('bcrypt-nodejs'); // Require our encryption algorithm
var fs = require('fs'); // Require module for interacting with file system
var Grid = require('gridfs-stream'); // Require module for streaming files to and from MongoDB GridFS
var User = require(_modelsdir + '/users.js'); // Require our user model
var Recipe = require(_modelsdir+'/recipes.js'); // Require of recipe model
var mongoose = require('mongoose'); // Require mongoose (used from GridFS connection)
var multer = require('multer'); // Require module for handling multipart form data (used for uploading files)
var upload = multer({dest: "./uploads"}); // Set upload location (destination)
var _ = require('underscore'); // Our JavaScript utility-belt (used for looping in our case)
var conn = mongoose.connection;
Grid.mongo = mongoose.mongo;
var gfs = Grid(conn.db);


module.exports = function (app,passport) {
    // Our homepage
    app.get('/', function (req, res) {
        res.render(path.resolve(_viewsdir + '/Home/intro.ejs')); // Render view
    });

    // Sign-in page/dashboard
    app.get('/index', function (req, res) {
        res.render(path.resolve(_viewsdir + '/Home/index.ejs'), { // Render view with given options
            loggedin: req.user !== undefined, // Check if user is logged in and pass the result to the client
            user: req.user // Pass the user model to the client
        });
    });



    // Route for privacy page
    app.get('/privacy_policy', function (req, res) {
        res.render(path.resolve(_viewsdir + '/Privacy/privacy.ejs'));
    });

    // Route for terms page
    app.get('/terms', function (req, res) {
        res.render(path.resolve(_viewsdir + '/Terms/terms.ejs'));
    });


    app.get('/home',isLoggedIn,function (req,res) {
        /**
         * FOR TESTING PURPOSES
         * @type {Array}
         */
        var docs = [];
        for(var i =0;i<5;i++){
            docs.push({
               "title" : "Chicken Mashroob",
                "image": "../../public/test.jpg",
                "_id" : "123123"
            });
        }
        //res.render(path.resolve(_viewsdir + '/Home/home.ejs'),{reco : docs});
        getSimilarities(req,res);
    });


    app.get('/get_recipe',function (req,res) {
        var id = req.query.id;
        var data = {
            "extendedIngredients" : ["rice","krispies","chicken"],
            "instructions" : "First do this\n then That\n then do all this"
        }
        // //get from database but nah
        // if(id === '123123'){
        //     res.writeHead(200, {"Content-Type": "application/json"});
        //     res.end(JSON.stringify(data));
        // }

        Recipe.find({
            '_id': {
                $in: id
            }
        }, function (err, docs) {
            res.writeHead(200, {"Content-Type": "application/json"});
            if(err){
                res.end("{}");
            }
            else
                res.end(JSON.stringify(data));
        })

    });

}




function getSimilarities(req,res) {
    var uRecipeArr = []; // Final result array (User liked recipes with appended similarities)
    var recipeIds = []; // Array of liked recipes by current user stored by their ObjectIds
    var i = 0;

    // Loop through user feedback array and collect positively rated recipes
    _.each(req.user.local.feedback, function (f) {
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
    }, {$sort: {_id: 1}}], function (err, recipes) {
        // Sort users liked recipes in ascending order to allow of O(nlogn) time looping.
        recipeIds.sort(function (a, b) {
            return a.toString().localeCompare(b.toString());
        });

        // Find similar recipes that match what the user liked. Similar recipes correspond to the id of the recipes
        // they are similar too.
        // TODO Use FindById to match recipes rather than manually looking it up (what is happening now)
        _.each(recipes, function (recipe) {
            if (recipeIds[i] !== undefined) { // Poor way of checking if out of array bounds
                if (recipe._id.toString() === recipeIds[i].toString()) {  // Found match?
                    uRecipeArr[i] = recipe; // Collect the recipe with its related recipe array
                    i++;
                }
            }
        });
        // Query database for full information (metadata) on acquired similar recipes (Returns top 3 similarities
        // of first liked recipe. Temporary solution. Needs to be more intelligent)

        //get all the items from the similarities array
        var similarities = [];
        uRecipeArr[0].similarities[1].forEach(function (item, index) {
            similarities[index] = item;
        });

        Recipe.find({
            '_id': {
                $in: similarities
            }
        }, function (err, docs) {
            // Return result to client
            res.render(path.resolve(_viewsdir + '/Home/home.ejs'),{recommendations : docs});
        })
    });
}


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
