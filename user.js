const crypto = require('crypto')
const config = require('./config.json')
const Minio = require('minio')
const uuidv4 = require('uuid/v4')

let minioClient = new Minio.Client(config.minio)
let bucket = config.auth_bucket.name

module.exports = {
  registerUser: (username, password) => {
    return new Promise((resolve, reject) => {
      minioClient.statObject(bucket, "users/" + username, function(err, stat) {
        if (err) {
          if(err.code == 'NotFound'){
            let hash = crypto.createHmac('sha256', password).digest('hex')
            minioClient.putObject(bucket, "users/" + username, hash, function(err, etag) {
              if(err){
                reject(err)
              }else{
                resolve(true)
              }
            })
            return
          }
          return reject(err.code)
        }
        return reject("User already exists")
      })
    })
  },
  newToken: (username, password) => {
    return new Promise((resolve, reject) => {
      minioClient.getObject(bucket, "users/" + username, function(err, dataStream) {
        if (err) {
          return reject(err.code)
        }
        let data = [];
        dataStream.on('data', function(chunk) {
          data.push(chunk)
        })
        dataStream.on('end', function() {
          data = Buffer.concat(data).toString()
          if(crypto.createHmac('sha256', password).digest('hex') == data){
            let token = uuidv4()
            let expires = new Date()
            expires.setMonth(expires.getMonth() + 1)
            let tokenObj = {user: username, expires: expires.getTime()}
            minioClient.putObject(bucket, "tokens/" + token, JSON.stringify(tokenObj), function(err, etag) {
              if(err){
                reject(err)
              }else{
                resolve(token)
              }
            })
          }else{
            reject("Password incorrect")
          }
        })
        dataStream.on('error', function(err) {
          reject(err)
        })
      })
    })
  },
  deleteToken: (token) => {
    return new Promise((resolve, reject) => {
      minioClient.removeObject(bucket, "tokens/" + token, function(err) {
        if (err) {
          return reject(err)
        }
        resolve(true)
      })
    })
  },
  tokenInfo: (token) => {
    return new Promise((resolve, reject) => {
      minioClient.getObject(bucket, "tokens/" + token, function(err, dataStream) {
        if (err) {
          return reject(err.code)
        }
        let data = [];
        dataStream.on('data', function(chunk) {
          data.push(chunk)
        })
        dataStream.on('end', function() {
          data = Buffer.concat(data).toString()
          data = JSON.parse(data)
          
          resolve(data)
        })
        dataStream.on('error', function(err) {
          reject(err)
        })
      })
    })
  }
}