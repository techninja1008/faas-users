const express = require('express')
const Minio = require('minio')
const app = express()
const config = require('./config.json')
const bodyParser = require('body-parser')
const user = require('./user.js')
const bearerToken = require('express-bearer-token')

let minioClient = new Minio.Client(config.minio)

function createIfNotExists(client, bucket){
  return new Promise((resolve, reject) => {
    client.bucketExists(bucket, function(err) {
      if (err) {
        if (err.code == 'NoSuchBucket') {
          client.makeBucket(bucket, config.bucket.region, function(errt) {
            if (errt) return reject(errt)
            resolve(1)
          })
        }
        reject(err)
        return
      }
      resolve(0)
    })
  })
}

app.use('/v1/*', bodyParser.json())

app.get('/v1/user_exists', function (req, res) {
  user.userExists(req.query.email).then(result => {
    res.json({
      meta: {
        error: null
      },
      data: result ? [{username: req.query.email}] : []
    })
  }).catch(err => {
    res.status(400).json({
      meta: {
        error: {
          message: err.toString()
        }
      },
      data: []
    })
    console.log("User exists: " + err)
  })
})

app.post('/v1/users', function (req, res) {
  let {email, username, password, repeat_password} = req.body
  
  username = email
  
  console.log(username)
  console.log(password)
  
  if(password != repeat_password){
    res.status(400).json({
      meta: {
        error: {
          message: "Passwords do not match"
        }
      },
      data: []
    })
    return
  }
  
  user.registerUser(username, password).then(result => {
    res.json({
      meta: {
        error: null
      },
      data: []
    })
  }).catch(err => {
    res.status(400).json({
      meta: {
        error: {
          message: err.toString()
        }
      },
      data: []
    })
    console.log("Register: " + err)
  })
})

app.post('/v1/access_tokens', function (req, res) {
  let {username, password} = req.body
  
  user.newToken(username, password).then(result => {
    res.json({
      meta: {
        error: null
      },
      data: [{
        access_token: result
      }]
    })
  }).catch(err => {
    res.status(400).json({
      meta: {
        error: {
          message: err.toString()
        }
      },
      data: []
    })
    console.log("Login: " + err)
  })
})

app.use(bearerToken())
app.delete('/v1/access_tokens', function (req, res) {
  user.deleteToken(req.token).then(result => {
    res.json({
      meta: {
        error: null
      }
    })
  }).catch(err => {
    res.status(400).json({
      meta: {
        error: {
          message: err.toString()
        }
      },
      data: []
    })
    console.log("Logout: " + err)
  })
})

app.use('/:ns/:service@:version', (req, res, next) => {
  if(!req.token){
    res.status(400).json({
      meta: {
        error: {
          message: "Unauthorised request"
        }
      },
      data: []
    })
  }else{
    user.tokenInfo(req.token).then(result => {
      if(result.user == req.params.ns){
        if(result.expires > Date.now()){
          next()
        }else{
          res.status(400).send("Error: Your token has expired. Please logout then login to refresh it.\n")
        }
      }else{
        res.status(400).send("Error: you are not authorised to upload this service\n")
      }
    }).catch(err => {
      res.status(400).json("Error: Exception:\n" + err.toString() + "\nPlease try logging out then back in again.\n")
    })
  }
})

app.post('/:ns/:service@:version', function (req, res) {
  let body = []
  req.on('data', (chunk) => {
    body.push(chunk)
  }).on('end', () => {
    body = Buffer.concat(body)
    
    minioClient.putObject(config.bucket.name, req.params.ns + "/" + req.params.service + "/" + req.params.version + ".tgz", body, function(err, etag) {
      if(err){
        res.send("ERROR: " + err)
      }else{
        res.send("Your service " + req.params.ns + "/" + req.params.service + "@" + req.params.version + " is now up and running. \nIt should function if you send it a request now!\n")
      }
    })
  });
})

createIfNotExists(minioClient, config.bucket.name).then(result => {
  return createIfNotExists(minioClient, config.auth_bucket.name)
}).then(result => {
  app.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}!`)
  })
}).catch(err => {
  console.log(err)
})