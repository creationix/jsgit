#!/usr/bin/env node
// Bootstrap the platform to run on node.js
require('js-git/lib/platform.js')(require('js-git-node-platform'));

// Load the libraries
var urlParse = require('url').parse;
var program = require('commander');
var autoProto = require('js-git/protocols/auto.js');
var fsDb = require('js-git/lib/fs-db.js');
var wrap = require('js-git/lib/repo.js');
var serial = require('js-git/helpers/serial.js');
var parallel = require('js-git/helpers/parallel.js');
var parallelData = require('js-git/helpers/parallel-data.js');
var pathResolve = require('path').resolve;

program
  .version(require('js-git/package.json').version)
  .usage('[options] [--] <url> [<dir>]')
  .option('--bare', 'create a bare repository')
  .option('-b, --branch <branch>', 'checkout <branch> instead of the remote\'s HEAD')
  .parse(process.argv);


if (program.args.length < 1 || program.args.length > 2) {
  program.outputHelp();
  process.exit(1);
}

var url = program.args[0];
var opts = urlParse(url);
if (!opts.protocol) {
  opts = urlParse("ssh://" + url);
}

var baseExp = /([^\/.]*)(\.git)?$/;
opts.target = program.args[1];
if (!opts.target) {
  opts.target = opts.pathname.match(baseExp)[1];
  if (program.bare) opts.target += '.git';
}

if (program.branch) {
  program.branch = "refs/heads/" + program.branch;
  opts.want = [program.branch];
}

opts.target = pathResolve(process.cwd(), opts.target);

var connection = autoProto(opts);
var repo = wrap(fsDb(opts.target, opts.bare));

var config = {
  includeTag: true,
  onProgress: function (data) {
    process.stdout.write(data);
  },
  onError: function (data) {
    process.stderr.write(data);
  }
};

parallelData({
  init: repo.init(),
  pack: connection.fetch(config),
}, function (err, result) {
  if (err) throw err;
  serial(
    parallel(
      repo.importRefs(result.pack.refs),
      repo.unpack(result.pack, config)
    ),
    connection.close()
  )(function (err) {
    if (err) throw err;
    console.log("DONE");
  });
});
