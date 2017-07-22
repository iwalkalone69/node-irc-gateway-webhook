'use strict';

module.exports.config = require('./src/config');
module.exports.handler = require('./src/handler');
module.exports.irc = require('./src/irc');
module.exports.parser = require('./src/parser');

module.exports.irc.setup(module.exports.config);
module.exports.irc.bind();
module.exports.irc.connect(module.exports.config);

module.exports.parser.setup(module.exports.config, module.exports.irc);

module.exports.handler.setup(module.exports.config, module.exports.parser);
module.exports.handler.bind();

let http = require('http');
http.createServer(module.exports.handler.detect).listen(module.exports.config.http_port, module.exports.config.http_host);
