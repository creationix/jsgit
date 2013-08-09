#!/usr/bin/env node
// Bootstrap the platform to run on node.js
require('js-git/lib/platform.js')(require('js-git-node-platform'));

// Load the libraries
var urlParse = require('url').parse;
var program = require('commander');
var autoProto = require('js-git/protocols/auto.js');

program
  .version(require('js-git/package.json').version)
  .usage('<url>')
  .parse(process.argv);


if (program.args.length != 1) {
  program.outputHelp();
  process.exit(1);
}

var url = program.args[0];
var opts = urlParse(url);
if (!opts.protocol) {
  opts = urlParse("ssh://" + url);
}

// Do the action
var connection = autoProto(opts);
connection.discover(function (err, refs) {
  if (err) throw err;
  Object.keys(refs).forEach(function (ref) {
    console.log(refs[ref] + "\t" + ref);
  });
  connection.close(function (err) {
    if (err) throw err;
  });
});
