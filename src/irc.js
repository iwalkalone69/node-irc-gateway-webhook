let IRC = require('irc-framework');

let irc = {
    is_joined: false,
    debug: false,
    chan: 'ChanServ',
    channel: '#debug',
    connection: new IRC.Client(),
    setup: function (config) {
        this.debug = config.debug;
        this.chan = config.chan_bot;
        this.channel = config.irc_channel;
    },
    connect: function (config) {
        this.connection.connect({
            host: config.irc_server,
            port: config.irc_port,
            nick: config.irc_nick,
            username: config.irc_realname,
            gecos: config.irc_ident,
            auto_reconnect_max_retries: 1000,
            ping_interval: config.irc_ping_interval,
        });
    },
    say: function (target, message) {
        this.connection.say(target, message);
    },
    bind: function () {
        this.connection.on('raw', event => {
            let line_parts = event.line.split(' ');
            if (line_parts[1] == 473) {
                /**
                 * We have to request an invite
                 */
                this.say(this.chan, 'INVITE '+line_parts[3]);
            } else {
                if (this.debug === true) {
                    console.log(event);
                }
            }
        });
        this.connection.on('message', event => {
            if (this.debug === true) {
                console.log(event);
            }
        });
        this.connection.on('registered', () => {
            function d() {
                if (this.is_joined) return;
                this.connection.join(this.channel);
                setTimeout(d, 7000);
            }
            d();
        });
        this.connection.on('socket close', () => {
            this.is_joined = false;
        });
        this.connection.on('close', () => {
            this.is_joined = false;
        });
        this.connection.on('invited', (event) => {
            this.connection.join(event.channel);
        });
        this.connection.on('join', event => {
            if (event.channel.toLowerCase() === this.channel.toLowerCase()) {
                this.is_joined = true;
            }
        });
    },
};

module.exports = irc;
