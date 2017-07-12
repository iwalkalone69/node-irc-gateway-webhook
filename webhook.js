'use strict';

let util = require('util');
let http = require('http');
let createGithubHandler = require('github-webhook-handler');
let createGitlabHandler = require('gitlab-webhook-handler');
let IRC = require('irc-framework');
let request = require('request');
var fs = require('fs');

let default_config = {
    http_host: '0.0.0.0',
    http_port: 7777,
    irc_channel: '#channel',
    irc_server: 'irc.freenode.net',
    irc_nick: 'webhook',
    irc_ident: 'webhook',
    irc_realname: 'webhook',
    irc_ping_interval: 30,
    irc_port: 6667,
    provider: 'github',
    secret: '',
    path: '/hooks/',
    chan_bot: 'ChanServ',
    google_shortener_apikey: '',
    debug: true,
};

let is_joined = false;

var handler = null;
var bot = new IRC.Client();

let config = {};
fs.stat('./config.json', function (err, stat) {
    if (err == null) {
        config = require('./config.json');
    }
    config = Object.assign(default_config, config);
    if (config.debug === true) {
        console.log(config);
    }
    run();
});

function setup_handler() {
    switch (config.provider) {
        case 'gitlab':
            handler = createGitlabHandler({
                path: config.path,
                secret: config.secret,
            });
            break;
        case 'github':
        default:
            handler = createGithubHandler({
                path: config.path,
                secret: config.secret,
            });
            break;
    }
}

function connect_bot() {
    bot.connect({
        host: config.irc_server,
        port: config.irc_port,
        nick: config.irc_nick,
        username: config.irc_realname,
        gecos: config.irc_ident,
        auto_reconnect_max_retries: 1000,
        ping_interval: config.irc_ping_interval,
    });
}

function setup_bot() {
    connect_bot();
    bot.on('raw', event => {
        let line_parts = event.line.split(' ');
        if (line_parts[1] == 473) {
            /**
             * We have to request an invite
             */
            bot.say(config.chan_bot, 'INVITE '+line_parts[3]);
        } else {
            if (config.debug === true) {
                console.log(event);
            }
        }
    });
    bot.on('message', event => {
        if (config.debug === true) {
            console.log(event);
        }
    });
    bot.on('registered', () => {
        function d() {
            if (is_joined) return;
            bot.join(config.irc_channel);
            setTimeout(d, 7000);
        }
        d();
    });
    bot.on('socket close', () => {
        is_joined = false;
        connect_bot();
    });
    bot.on('close', () => {
        is_joined = false;
    });
    bot.on('invited', (event) => {
        bot.join(event.channel);
    });
    bot.on('join', event => {
        if (event.channel.toLowerCase() === config.irc_channel.toLowerCase()) {
            is_joined = true;
        }
    });
}

function setup_http_server() {
    http.createServer(function (req, res) {
        handler(req, res, function () {
            res.statusCode = 404;
            res.end('no such location');
        });
    }).listen(config.http_port, config.http_host);
}

function process_push(event) {
    let repo = '';
    let commits = [];
    let total_commits = 0;
    let pusher_name = '';
    let ref = '';
    let url = '';
    switch (config.provider) {
        case 'gitlab':
            repo = event.payload.repository;
            commits = event.payload.commits;
            total_commits = event.payload.total_commits_count;
            pusher_name = event.payload.user_name;
            ref = lastItem(event.payload.ref.split('/'));
            url = event.payload.project.web_url+'/compare/'+event.payload.before.substr(0,7)+'...'+event.payload.after.substr(0,7);

            request({
                method: 'POST',
                url: 'https://www.googleapis.com/urlshortener/v1/url',
                qs: {
                    'key': config.google_shortener_apikey,
                },
                body: {
                    longUrl: event.payload.project.web_url+'/compare/'+event.payload.before.substr(0,7)+'...'+event.payload.after.substr(0,7),
                },
                json: true,
            }, function(error, response, body) {
                if (!error) {
                    url = body.id;
                }

                bot.say(config.irc_channel, util.format('[%s] %s pushed %d commit(s) to %s. %s', repo.name, pusher_name, total_commits, ref, url));
                for(let i=0; i<commits.length && i<5; i++){
                    let commit = commits[i];
                    bot.say(config.irc_channel, util.format('[%s] %s %s: %s', repo.name, commit.id.substr(0, 7), commit.author.name, commit.message));
                }
            });
            break;
        case 'github':
        default:
            repo = event.payload.repository;
            commits = event.payload.commits;
            total_commits = commits.length;
            pusher_name = event.payload.pusher.name;
            ref = lastItem(event.payload.ref.split('/'));

            request.post({
                url: 'https://git.io/',
                formData: {
                    url: event.payload.compare,
                },
                followRedirect: false,
            }, function(error, response, body) {
                url = event.payload.compare;
                if (!error && response.headers.location) {
                    url = response.headers.location;
                }

                bot.say(config.irc_channel, util.format('[%s] %s pushed %d commit(s) to %s. %s', repo.full_name, pusher_name, total_commits, ref, url));
                for(let i=0; i<commits.length && i<5; i++){
                    let commit = commits[i];
                    bot.say(config.irc_channel, util.format('[%s] %s %s: %s', repo.full_name, commit.id.substr(0, 7), commit.author.username, commit.message));
                }
            });
            break;
    }
}

function process_issues(event) {
    if (config.debug === true) {
        console.log('Received an issue event for %s action=%s: #%d %s',
            event.payload.repository.name,
            event.payload.action,
            event.payload.issue.number,
            event.payload.issue.title
        );
    }

    let msg = '';
    let action = '';
    let repo_name = '';
    let id = 0;
    let title = '';
    let url = '';

    switch (config.provider) {
        case 'gitlab':
            action = event.payload.object_attributes.state;
            repo_name = event.payload.repository.name;
            id = event.payload.object_attributes.iid;
            title = event.payload.object_attributes.title;
            url = event.payload.object_attributes.url;
            break;
        case 'github':
        default:
            action = event.payload.action;
            repo_name = event.payload.repository.full_name;
            id = event.payload.issue.number;
            title = event.payload.issue.title;
            url = event.payload.issue.url;
            break;
    }

    if (action === 'closed') {
        msg = util.format('[%s] Issue closed. #%d %s %s', repo_name, id, title, url);
    } else if (action === 'opened') {
        msg = util.format('[%s] Issue opened. #%d %s %s', repo_name, id, title, url);
    }

    if (msg != '') {
        bot.say(config.irc_channel, msg);
    }
}

function setup_handler_binds() {
    handler.on('error', function (err) {
        console.error('Error:', err.message);
    });

    handler.on('*', function (event) {
        if (config.debug === true) {
            console.log(event);
        }
        switch (event.event) {
            case 'push':
                process_push(event);
                break;
            case 'issue':
            case 'issues':
                process_issues(event);
                break;
            default:
                console.log('Unknown event', event.event);
                break;
        }
    });
}

function run() {
    setup_handler();
    setup_bot();
    setup_http_server();
    setup_handler_binds();
}

function lastItem(arr) {
    return arr[arr.length - 1];
}
