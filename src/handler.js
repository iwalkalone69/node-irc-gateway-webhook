let createGithubHandler = require('github-webhook-handler');
let createGitlabHandler = require('gitlab-webhook-handler');

let handler = {
    debug: false,
    parser: null,
    githubHandler: null,
    gitlabHandler: null,
    setup: function(config, parser) {
        this.debug = config.debug;
        this.parser = parser;
        this.gitlabHandler = createGitlabHandler({
            path: config.path,
            secret: config.gitlab.secret,
        });
        this.githubHandler = createGithubHandler({
            path: config.path,
            secret: config.github.secret,
        });
    },
    bind: function() {
        this.githubHandler.on('error', this.onerror);
        this.gitlabHandler.on('error', this.onerror);
        this.githubHandler.on('*', this.github_ondata);
        this.gitlabHandler.on('*', this.gitlab_ondata);
    },
    onerror: function (err) {
        console.error('Error:', err.message);
    },
    github_ondata: function(event) {
        handler.ondata(event, 'github');
    },
    gitlab_ondata: function(event) {
        handler.ondata(event, 'gitlab');
    },
    ondata: function (event, provider) {
        if (handler.debug === true) {
            console.log(event);
        }
        switch (event.event) {
            case 'push':
                handler.parser.push(event, provider);
                break;
            case 'issue':
            case 'issues':
                handler.parser.issue(event, provider);
                break;
            default:
                console.log('Unknown event', event.event);
                break;
        }
    },
    detect: function (req, res) {
        if (req.headers['X-Github-Event'] || req.headers['x-github-event']) {
            handler.githubHandler(req, res, function () {
                res.statusCode = 404;
                res.end('no such location');
            });
        } else if (req.headers['X-Gitlab-Event'] || req.headers['x-gitlab-event']) {
            handler.gitlabHandler(req, res, function () {
                res.statusCode = 404;
                res.end('no such location');
            });
        } else {
            console.log('Unknown provider', req.headers);
            res.statusCode = 404;
            res.end('unknown provider');
        }
    },
};

module.exports = handler;
