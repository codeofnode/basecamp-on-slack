# Base Camp on slack
Monitor base camp todos and post them in a Slack channel.

## Pre-requisites
- AWS account with [AWS-CLI](https://aws.amazon.com/cli/) configured
- [DynamoDB] account
- [Basecamp](https://basecamp.com) account
- [Serverless](https://serverless.com) framework installed
- [Slack](https://slack.com) team with incoming webhook

## How to use it
in `serverless.yml` change the environment variables to your own values.

`DYNAMODB_TABLE` to setup DYNAMODB.
`BC_USER_TABLE` to setup DYNAMODB.

`BASECAMP_KEY` to authentication key to access BASECAMP API

`BASECAMP_ACCOUNT_ID` the account id of basecamp
`BASECAMP_PROJECT_ID` the project id of basecamp
`BASECAMP_LIST_ID` the todo list id of basecamp

`SLACK_WEBHOOK_URL` is the URL of the Slack incoming webhook you’ve created 

`SLACK_CHANNEL` should be an existing channel name in your Slack team (#basecamp)
`SLACK_USERNAME` the username/botname of slack
`SLACK_ACCESS_TOKEN` the slack access tocken for the slackbot
`SLACK_USERLIST_URL` the url to fetch all slack users

### assign a task
> you need to have another table to store basecame userid -> slack userid mapping.
Simply reply the notification from bot as below
`assignto @username`

## workflow
* Sync the users
* * Fetch slack users
* * Fetch basecamp users
* * create the map into table: BC_USER_TABLE
* For each interval of 10 minutes
* * Lamda handler is called to make query to find the new todos
* * For each todo, create entry in table : DYNAMODB_TABLE and make a slack post
* whenever a user replys to that notification with above synctax
* * It assigns mentioned user to that task

### test locally
`serverless invoke local — function getBasecampTodos`

### deploy
`serveless deploy`

## Contribute
This project is open source, and we welcome anybody who wants to participate and contribute!

## License
The MIT License (MIT)
