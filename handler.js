'use strict';

var request = require('json2server').methods.request;
const AWS = require('aws-sdk');
const client = new AWS.DynamoDB.DocumentClient();
const BC_BASE_URL = `https://3.basecampapi.com/${process.env.BASECAMP_ACCOUNT_ID}`;
const BC_URL = `${BC_BASE_URL}/buckets/${process.env.BASECAMP_PROJECT_ID}/todolists/${process.env.BASECAMP_LIST_ID}`;

let STOPCHECKING = false;

const forEachTodo = (todo) => {
  if(STOPCHECKING) return;
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      id: todo.id,
    },
  };
  // fetch todo from the database
  client.get(params, (error, result) => {
    // handle potential errors
    if (error || !result) {
      console.log('err',error)
      sendToSlack(todo, function(thread){
        const timestamp = new Date().getTime();
        const postParams = {
          TableName: process.env.DYNAMODB_TABLE,
          Item: {
            id: todo.id,
            text: todo.content,
            status: todo.status,
            assignees: (todo.assignees || []).map(asg => asg.id),
            createdAt: timestamp,
            updatedAt: timestamp,
            threadts: thread.ts,
          },
        };
        // write the todo to the database
        client.put(postParams, (error) => {
          // handle potential errors
          if (error) {
            console.error(error);
            // send notification to slack
            sendErrorToSlack(error, todo, 'todo could not be created');
          }
        });
      });
    } else {
      console.log('exists', result.item);
      STOPCHECKING = true;
    }
  });
};

module.exports.getBasecampTodos = (event, context, callback) => {
  STOPCHECKING = false;

  request({
     method: 'GET',
     url: `${BC_URL}/todo.json`,
     headers: {
       Authorization: `Bearer ${process.env.BASECAMP_KEY}`
     }
   }, function(err, result){
     if(err) return console.log('err_', err)
     result.parsed.forEach(forEachTodo);
   })
};

function sendErrorToSlack(er, todo, message){
  // need to customize as per need
  console.log('SEND ERROR TO SLACK');
  let requestData = {
    channel: process.env.SLACK_CHANNEL,
    icon_url: process.env.BASECAMP_ICON_URL,
    username: process.env.SLACK_USERNAME,
    text: 'Error creating todo <'+todo.url+'|'+'Basecamp>',
    unfurl_links: true,
    attachments: [
      {
        fallback: `${message} on Basecamp : ${er.message}`,
        color: '#d60c2e',
        author_name: todo.creator.name,
        author_icon: todo.creator.avatar_url,
        title: todo.content,
        title_link: todo.url,
        footer: 'Error on dynamodb while creating todo notification',
        footer_icon: process.env.BASECAMP_ICON_URL,
        ts: todo.created_at,
        unfurl_links: true,
        fields: [
              {
                  title: 'Description',
                  value: todo.description || 'No description found.',
                  short: true
              }
          ]
      }
    ]
  };
  const options = {
    url: process.env.SLACK_WEBHOOK_URL,
    method: 'POST',
    payload: requestData
  };
  request(options).then(function(err,res){
    if(err) console.log('sendErrorToSlack ERR', err);
  });
}

function sendToSlack(todo, after){
  console.log('SEND TO SLACK');
  let requestData = {
    channel: process.env.SLACK_CHANNEL,
    icon_url: process.env.BASECAMP_ICON_URL,
    username: process.env.SLACK_USERNAME,
    token: process.env.SLACK_ACCESS_TOKEN,
    text: 'New todo <'+todo.url+'|'+'Basecamp>',
    unfurl_links: true,
    attachments: [
      {
        fallback: `A new todo on Basecamp`,
        color: '#0cd644',
        author_name: todo.creator.name,
        author_icon: todo.creator.avatar_url,
        title: todo.content,
        title_link: todo.url,
        footer: 'New basecamp todo notification',
        footer_icon: process.env.BASECAMP_ICON_URL,
        ts: todo.created_at,
        unfurl_links: true,
        fields: [
              {
                  title: 'Description',
                  value: todo.description || 'No description found.',
                  short: true
              }
          ].concat(todo.assignees.map((asg, ind) => ({
            title: `Assignee ${ind + 1}`,
            value: asg.name,
            short: true,
          })))
      }
    ]
  };
  const options = {
    url: process.env.SLACK_WEBHOOK_URL,
    method: 'POST',
    payload: requestData
  };
  request(options).then(function(err,res){
    if(err) console.log('sendToSlack ERR', err);
    else after(res.parsed);
  });
}

function sendReplyToThread(threadts, mesg){
  request({
    url : process.env.SLACK_WEBHOOK_URL,
    method: 'POST',
    payload: {
      channel: event.channel,
      thread_ts:thread_ts,
      token: process.env.SLACK_ACCESS_TOKEN,
      text: mesg
    }
  });
}

function findTheUser(text, next) {
  const slackuserid = text.split(' ').pop().split('|').shift().substring(2)
  const params = {
    TableName: process.env.BC_USER_TABLE,
    Key: {
      slackId: slackuserid,
    },
  };
  client.get(params, (error, result) => {
    if(error || !result) {
      next(error || 'user not found');
    } else {
      next(result.basecampId);
    }
  });
}

function processTask(event, callback) {
  // making rough validation
  if (event.bot_id && event.text.statsWith('assignto') && event.threadts) {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        threadts: event.thread_ts,
      },
    };
    // fetch todo from the database
    client.get(params, (error, result) => {
      // handle potential errors
      if (error || !result) {
        console.log('todo not registered ignoring',error);
        // reply the ack
        sendReplyToThread(event.thread_ts, 'todo not found');
      } else {
        params.Key.id = result.id;
        // update the todo in the database
        client.update(params, (error, result) => {
          // handle potential errors
          if (error) {
            console.error(error);
            callback(new Error('Couldn\'t update the todo item.'));
            return;
          }
        });
        findTheUser(event.text, function(err,bc_userid){
          if(err || !bc_userid) {
            sendReplyToThread(event.thread_ts, 'oops... basecamp user not found in usertable');
          } else {
            request({
              url : `${BC_URL}/${result.id}.json`,
              method: 'PUT',
              payload: {
                assignees: result.assignees.push(bc_userid)
              }
            }, function(er, resp){
              // reply the ack
              sendReplyToThread(event.thread_ts, 'done..!');
            });
          }
        });
      }
    });
  } else {
    // ignore
  }
}

module.exports.assignTask = (data, context, callback) => {
  switch (data.type) {
    case "message_replied": processTask(data.event, callback); break;
    default: callback(null);
  }
};

function syncUsers(){
  var maps = {};
  var arrs = [];
  request(process.env.SLACK_USERLIST_URL, function(er,resp){
    if(!er && resp && resp.parsed && Array.isArray(resp.parsed.members)) {
      resp.parsed.members.forEach((mm) => {
        map[mm.profile.email] = { slackId: mm.id, email: mm.profile.email };
      });
      request(`${BC_BASE_URL}/people.json`, function(er,resp){
        if(!er && resp && resp.parsed && Array.isArray(resp.parsed)) {
          resp.parsed.forEach((mm) => {
            map[mm.email_address] = map[mm.email_address] || {};
            map[mm.email_address].basecampId = mm.id;
          });
          Object.keys(maps).forEach((em) => {
            if(Object.keys(maps[em]).length === 2) {
              arrs.push({
                PutRequest: {
                  Item: maps[em]
                }
              });
            }
          });
          client.batchWriteItem({
            RequestItems:{
              [process.env.BC_USER_TABLE] : arrs
            }
          }, function(er){
            if(err) console.log('USERS_NOT_SYNCED', er);
            else console.log('USERS_SYNCED');
          });
        }
      });
    }
  });
};

module.exports.syncUsers = (data, context, callback) => {
  syncUsers();
  callback(null);
}

syncUsers();
