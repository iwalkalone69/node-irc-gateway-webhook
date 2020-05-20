let fs = require('fs');

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
    github: {
        secret: '',
    },
    gitlab: {
        secret: '',
    },
    path: '/hooks/',
    chan_bot: 'ChanServ',
    debug: true,
};

let config_file = process.cwd() + '/' + (process.argv && process.argv[2] ? process.argv[2] : 'config.json');
try {
    config = require(config_file);
} catch (e) {
    console.log(e);
    process.exit();
}
config = Object.assign(default_config, config);
if (config.debug === true) {
    console.log(config);
}

module.exports = config;
