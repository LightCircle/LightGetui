/**
 * @file 个推推送<br>
 *   依赖Google的protobuf，需要安装<br>
 *   for Linux: $ npm install node-protobuf<br>
 *   for Mac: $ brew install protobuf<br>
 *   参考: https://github.com/fuwaneko/node-protobuf<br>
 * @module light.bridge.getui
 * @author r2space@gmail.com
 * @version 1.0.0
 */

"use strict";

var light     = require("light-core")
  , _         = light.util.underscore
  , crypto    = require("crypto")
  , request   = light.util.request
  , Template  = require("./template")
  , constant  = require("./constant")
  ;

/**
 * @desc 认证
 * @param {Function} callback 回调函数
 */
exports.auth = function(callback) {

  var template = new Template()
    , timeStamp = new Date().getTime()
    , sign = md5(template.appKey + timeStamp + template.masterSecrt);

  request.post(constant.GETUI_PUSH_URL, {
    json: {
      action    : "connect",
      appkey    : template.appKey,
      timeStamp : timeStamp,
      sign      : sign,
      version   : "3.0.0.0"
    }
  }, function (err, response, body) {
    if (!err && response.statusCode == 200) {
      callback(err, body);
    }
  });
};

/**
 * @desc 推送
 * @param {string} token
 * @param {object} option
 * @param {string} option.title 消息内容,IOS时可以为空
 * @param {string} option.text 通知消息
 * @param {string} option.payload 通知详细
 * @param {string} option.type NotifyMsg或TransmissionMsg
 * @param {Function} callback 回调函数
 */
exports.push = function(token, option, callback) {
  if (_.isArray(token)) {
    exports.pushList(token, option, callback);
  } else {
    exports.pushOne(token, option, callback);
  }
};

/**
 * @desc 推送给单个用户
 * @param {string} token
 * @param {object} option
 * @param {string} option.title 消息内容,IOS时可以为空
 * @param {string} option.text 通知消息
 * @param {string} option.payload 通知详细
 * @param {string} option.type NotifyMsg或TransmissionMsg
 * @param {Function} callback 回调函数
 */
exports.pushOne = function(token, option, callback){

  var template = new Template(option.type, option.title, option.text)
    , json = getJsonStructure(template);

  json.appId = template.appId;
  json.transmissionContent = option.payload;
  json.action = "pushMessageToSingleAction";
  json.clientId = token;

  post(constant.GETUI_PUSH_URL, { json: json }, function (err, response, body) {
    return callback(err, body);
  });
};

/**
 * 推送给多个用户
 * @param {string} token
 * @param {object} option
 * @param {string} option.title 消息内容,IOS时可以为空
 * @param {string} option.text 通知消息
 * @param {string} option.payload 通知详细
 * @param {string} option.type NotifyMsg或TransmissionMsg
 * @param {Function} callback 回调函数
 */
exports.pushList = function(tokens, option, callback){

  var template = new Template(option.type, option.title, option.text)
    , json = getJsonStructure(template);

  json.transmissionContent = option.payload;
  json.action = "getContentIdAction";
  json.taskGroupName = "";

  // 获取群发的contentId
  post(constant.GETUI_PUSH_URL, { json: json }, function (err, response, body) {

    if (err || response.statusCode != 200) {
      return callback(err || response.statusCode);
    }

    var contentId = body.contentId
      , targetList = [];

    // 生成发送对象列表
    _.each(tokens, function(token) {
      targetList.push({ alias: "", clientId: token, appId: template.appId });
    });

    json = {
      appkey      : template.appKey,
      contentId   : contentId,
      needDetails : "true",
      version     : "3.0.0.0",
      action      : "pushMessageToListAction",
      type        : 2,
      targetList  : targetList
    };

    // 发送消息
    post(constant.GETUI_PUSH_URL, { json: json }, function (err, response, body) {
      return callback(err, body);
    });

  });
};

/**
 * @desc 给所有的人发消息
 * @param {object} option
 * @param {string} option.title 消息内容,IOS时可以为空
 * @param {string} option.text 通知消息
 * @param {string} option.payload 通知详细
 * @param {string} option.type NotifyMsg或TransmissionMsg
 * @param {Function} callback 回调函数
 */
exports.pushAll = function(option, callback){

  var template = new Template(option.type, option.title, option.text)
    , json = getJsonStructure(template);

  json.taskGroupName = "";
  json.transmissionContent = option.payload;
  json.contentType = 2;
  json.provinceList = [];
  json.appIdList = [template.appId];
  json.action = "getContentIdAction";
  json.phoneTypeList = [];
  json.tagList = [];

  // 获取群发的contentId
  post(constant.GETUI_PUSH_URL, { json: json }, function (err, response, body) {
    if (err || response.statusCode != 200) {
      return callback(err || response.statusCode);
    }

    json = {
      appkey      : template.appKey,
      contentId   : body.contentId,
      version     : "3.0.0.0",
      action      : "pushMessageToAppAction",
      type        : 2
    };

    // 发送消息
    post(constant.GETUI_PUSH_URL, { json: json }, function (err, response, body) {
      return callback(err, body);
    });

  });

};

/**
 * @desc 生成MD5
 * @param text
 * @returns {*}
 * @ignore
 */
function md5(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

/**
 * @desc 获取json解雇
 * @param template
 * @returns {}
 * @ignore
 */
function getJsonStructure(template) {
  return {
    appkey              : template.appKey,
    pushType            : template.pushType,
    clientData          : template.getTransparent(),
    pushNetWorkType     : 0,
    type                : 2,
    offlineExpireTime   : 360000,
    version             : "3.0.0.0",
    isOffline           : "true"
  }
}

/**
 * @desc 发送请求，如果出错，则进行认证以后，再试一次
 * @param url
 * @param param
 * @param callback
 * @ignore
 */
function post(url, param, callback) {
  request.post(url, param, function (err, response, body) {

    // 如果返回sign_error, 认证以后则再执行一次请求
    if (!err && body && body.result == "sign_error") {
      exports.auth(function(err, result) {
        if (err) {
          return callback(err);
        }

        request.post(url, param, function (err, response, body) {
          callback(err, response, body);
        });
      });

      return;
    }
    callback(err, response, body)
  });
}
