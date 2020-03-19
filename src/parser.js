let request = require('request');
let util = require('util');

let parser = {
    debug: false,
    google_shortener_apikey: '',
    irc_channel: '#debug',
    irc: null,
    setup: function (config, irc) {
        this.debug = config.debug;
        this.irc_channel = config.irc_channel;
        this.google_shortener_apikey = config.google_shortener_apikey;
        this.irc = irc;
    },
    push: function (event, provider) {
        let repo = '';
        let commits = [];
        let total_commits = 0;
        let pusher_name = '';
        let ref = '';
        let url = '';
        switch (provider) {
            case 'gitlab':
                repo = event.payload.repository;
                commits = event.payload.commits;
                total_commits = event.payload.total_commits_count;
                pusher_name = event.payload.user_name;
                ref = parser.lastItem(event.payload.ref.split('/'));
                url = event.payload.project.web_url+'/compare/'+event.payload.before.substr(0,7)+'...'+event.payload.after.substr(0,7);

                request({
                    method: 'POST',
                    url: 'https://www.googleapis.com/urlshortener/v1/url',
                    qs: {
                        'key': parser.google_shortener_apikey,
                    },
                    body: {
                        longUrl: event.payload.project.web_url+'/compare/'+event.payload.before.substr(0,7)+'...'+event.payload.after.substr(0,7),
                    },
                    json: true,
                }, function(error, response, body) {
                    if (!error) {
                        url = body.id;
                    }

                    parser.irc.say(parser.irc_channel, util.format('[%s] %s pushed %d commit(s) to %s. %s', repo.name, pusher_name, total_commits, ref, url));
                    for (let i=0; i<commits.length && i<5; i++) {
                        let commit = commits[i];
                        parser.irc.say(parser.irc_channel, util.format('[%s] %s %s: %s', repo.name, commit.id.substr(0, 7), commit.author.name, commit.message));
                    }
                    if (commits.length > 5) {
                        parser.irc.say(parser.irc_channel, util.format('And %i commits more.', commits.length - 5));
                    }
                });
                break;
            case 'github':
            default:
                repo = event.payload.repository;
                commits = event.payload.commits;
                total_commits = commits.length;
                pusher_name = event.payload.pusher.name;
                ref = parser.lastItem(event.payload.ref.split('/'));

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

                    parser.irc.say(parser.irc_channel, util.format('[%s] %s pushed %d commit(s) to %s. %s', repo.full_name, pusher_name, total_commits, ref, url));
                    for (let i=0; i<commits.length && i<5; i++) {
                        let commit = commits[i];
                        parser.irc.say(parser.irc_channel, util.format('[%s] %s %s: %s', repo.full_name, commit.id.substr(0, 7), commit.author.username, commit.message));
                    }
                    if (commits.length > 5) {
                        parser.irc.say(parser.irc_channel, util.format('And %i commits more.', commits.length - 5));
                    }
                });
                break;
        }
    },
    issue: function (event, provider) {
        if (parser.debug === true) {
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
        let user = '';
        let assignee = '';
        let labels = new Array();

        switch (provider) {
            case 'gitlab':
                action = event.payload.object_attributes.action;
                repo_name = event.payload.repository.name;
                id = event.payload.object_attributes.iid;
                title = event.payload.object_attributes.title;
                url = event.payload.object_attributes.url;
                user = event.payload.user.name;
                if (event.payload.assignee) {
                    assignee = event.payload.assignee.name;
                } else if (event.payload.assignees && event.payload.assignees.length > 0) {
                    assignee = event.payload.assignees[0].name;
                } else {
                    assignee = '-';
                }
                for (i=0; i<event.payload.labels.length; i++) {
                    labels.push(event.payload.labels[i].title);
                }
                break;
            case 'github':
            default:
                action = event.payload.action;
                repo_name = event.payload.repository.full_name;
                id = event.payload.issue.number;
                title = event.payload.issue.title;
                url = event.payload.issue.html_url;
                user = event.payload.issue.user.login;
                assignee = event.payload.issue.assignee.login;
                for (i=0; i<event.payload.issue.labels.length; i++) {
                    labels.push(event.payload.issue.labels[i].name);
                }
                break;
        }

        if (labels.length < 1) {
            labels.push('-');
        }
        if (action === 'closed' || action === 'close') {
            msg = util.format('[%s] Issue closed by %s. #%d %s [%s] assigned to %s: %s', repo_name, user, id, title, labels.join(" "), assignee, url);
        } else if (action === 'opened' || action === 'open') {
            msg = util.format('[%s] Issue opened by %s. #%d %s [%s] assigned to %s: %s', repo_name, user, id, title, labels.join(" "), assignee, url);
        } else {
            msg = util.format('[%s] Issue updated by %s. #%d %s [%s] assigned to %s: %s', repo_name, user, id, title, labels.join(" "), assignee, url);
        }

        parser.irc.say(parser.irc_channel, msg);
    },
    lastItem: function (arr) {
        return arr[arr.length - 1];
    },
};

module.exports = parser;
