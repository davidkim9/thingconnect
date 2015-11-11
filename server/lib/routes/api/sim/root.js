var mongoose = require('mongoose');
var router = require('express').Router({
  mergeParams: true
});

var Sim = mongoose.model('Sim');
var Verify = mongoose.model('Verify');

var http = require('http');
var https = require('https');

var url = require('url');

router.route('/').get(function(req, res) {
  var user = req.user;
  Sim.find({owner: user, verified: true}, function(err, sims) {
    if(err || !sims){
      console.log("Message Processing Error", err, sims);
      return res.ok([]);
    }else{
      res.ok(sims);
    }
  });
});

router.get('/test/:sim/:payload', function(req, res) {
  var simId = req.params.sim;
  var payload = req.params.payload;
  processMessage(simId, payload);
  res.ok(true);
});

//http://localhost:5000/api/sim/test/123/*86803%23
function activateSim(sim, verification){
  //Set ownership of sim
  sim.verified = true;
  sim.owner = verification.owner;
  sim.save();

  //delete verification
  verification.verified = true;
  verification.save();
}

function processSimCallback(sim, payload){
  if(sim.callbackUrl){
    var urlObj = url.parse(sim.callbackUrl);
    var simId = sim.simId;
    var encodedPayload = encodeURIComponent(payload);
    var options = {
      host: urlObj.host,
      path: (urlObj.pathname?urlObj.pathname:"") + "?" + (urlObj.query?urlObj.query:"") + "&sim=" + simId + "&payload=" + encodedPayload
    };
    callback = function(response) {
      var str = '';
      response.on('data', function (chunk) {
        str += chunk;
      });
      response.on('end', function () {
        console.log(str);
      });
    }
    if(urlObj.protocol == "https:"){
      https.request(options, callback).end();
    }else if(urlObj.protocol == "http:"){
      http.request(options, callback).end();
    }
  }
  console.log("processSimCallback()");
  //http.request(options, callback).end();
}

function processSim(sim, payload){
  if(sim.locked) return;

  console.log("Processing sim ", sim, payload);
  if(sim.verified){
    //Payload logic
    console.log("process payload logic");
    processSimCallback(sim, payload);
  }else{
    //Verify logic
    console.log(payload);
    Verify.findOne({simId: sim.simId}, function(err, verification) {
      if(!err && verification){
        if(verification.verify(payload)){
          //Activate sim card
          activateSim(sim, verification);
          console.log("Activate sim card");
        }else{
          console.log("verification failed");
        }
      }else{
        //No verification created yet
        console.log("Verification failed");
      }
    });
  }
}

function processMessage(simId, payload){
  Sim.findOne({simId: simId}, function(err, sim) {
    if(err){
      console.log("Message Processing Error", simId, payload, err);
      return;
    }
    if(!sim) {
      Sim.createSim(simId, function(err, sim) {
        if(!err && sim)
          processSim(sim, payload);
        console.log(err, sim);
      });
      //Create sim without user
      console.log("Sim not found, creating", simId, payload);
    } else {
      processSim(sim, payload);
    }
  });
}

module.exports = router;
