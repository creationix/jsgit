#!/usr/bin/env node

var tcp = require('min-stream-node/tcp.js');
var fetch = require('git-fetch');
var cat = require('min-stream/cat.js');
var pktLine = require('git-pkt-line');
var urlParse = require('url').parse;
var pathJoin = require('path').join;
var dirname = require('path').dirname;
var mkdirp = require('mkdirp');
var fs = require('fs');
var zlib = require('zlib');
var bops = require('bops');
var crypto = require('crypto');
var streamToSink = require('min-stream-node/common.js').streamToSink;

var program = require('commander');

program
  .version(require('./package.json').version)
  .usage('url [options]')
  .option('-t, --target [target]', 'Set a custom target directory')
  .option('-b, --bare', 'Bare clone')
  .parse(process.argv);


if (program.args.length !== 1) {
  program.outputHelp();
  process.exit(1);
}

var options = urlParse(program.args[0]);
options.port = options.port ? parseInt(options.port, 10) : 9418;

if (options.protocol !== "git:") {
  console.error("Invalid URL: " + JSON.stringify(program.args[0]));
  throw new Error("Sorry, only git:// protocol is implemented so far");
}

var baseExp = /([^\/.]*)(\.git)?$/;
options.target = program.target || options.pathname.match(baseExp)[1];

var repo = new FileRepo(options.target, program.bare);
console.log("Cloning repo into '%s'...", repo.path);

tcp.connect(options.hostname, options.port, function (err, socket) {
  if (err) throw err;

  var request = "git-upload-pack " + options.pathname + "\0host=" + options.hostname + "\0";
  socket.sink(
    cat(
      [pktLine.frameHead(request), request],
      fetch(options, onStream)(
        socket.source
      )
    )
  );
});


function onStream(err, sources) {
  if (err) throw err;
  var HEAD;
  Object.keys(sources.refs).forEach(function (ref) {
    var hash = sources.refs[ref];
    if (ref === "HEAD") {
      HEAD = hash;
      return;
    }
    if (/\^\{\}$/.test(ref)) return;
    repo.writeRef(ref, hash, checkError);
    if (hash === HEAD) {
      repo.writeSymbolicRef("HEAD", ref, checkError);
      HEAD = undefined;
    }
  });
  consume(sources.line);
  streamToSink(process.stdout, false)(sources.progress);
  streamToSink(process.stderr, false)(sources.error);
  var total;
  var num = 0;
  consume(sources.objects, function (object, callback) {
    if (total === undefined) total = object.num + 1;
    ++num;
    process.stdout.write("Receiving objects: " + Math.round(100 * num / total) + "% (" + num + "/" + total + ")\r");
    repo.writeObject(object, callback);
    // Stop reading when we've got all the objects.
    if (num === total) return false;
  }, function (err) {
    if (err) throw err;
    console.log("Receiving objects: 100% (" + total + "/" + total + "), done.");
    if (!repo.bare) repo.checkout("HEAD", checkError);
  });
}

function checkError(err) {
  if (err) throw err;
}

// Eat all events in an async stream with optional onData callback.
function consume(read, onItem, callback) {
  var close;
  if (!callback) {
    callback = checkError;
  }

  start();

  function start() {
    if (close === false) {
      callback();
    }
    else if (close) {
      read(close, callback);
    }
    else {
      read(null, onRead);
    }
  }

  function onRead(err, item) {
    if (item === undefined) {
      callback(err);
    }
    else {
      if (onItem) {
        close = onItem(item, onWrite);
      }
      else {
        start();
      }
    }
  }

  function onWrite(err) {
    if (err) {
      callback(err);
    }
    else {
      start();
    }
  }
}


var parsers = {
  tree: function (item) {
    var list = [];
    var data = item.data;
    var hash;
    var mode;
    var path;
    var i = 0, l = data.length;
    while (i < l) {
      var start = i;
      while (data[i++] !== 0x20);
      mode = parseInt(bops.to(bops.subarray(data, start, i - 1)), 8);
      start = i;
      while (data[i++]);
      path = bops.to(bops.subarray(data, start, i - 1));
      hash = bops.to(bops.subarray(data, i, i + 20), "hex");
      i += 20;
      list.push({
        mode: mode,
        path: path,
        hash: hash
      });
    }
    return list;
  },
  blob: function (item) {
    return item.data;
  },
  commit: function (item) {
    var data = item.data;
    var i = 0, l = data.length;
    var key;
    var items = {};
    while (i < l) {
      var start = i;
      while (data[i++] !== 0x20);
      key = bops.to(bops.subarray(data, start, i - 1));
      start = i;
      while (data[i++] !== 0x0a);
      items[key] = bops.to(bops.subarray(data, start, i - 1));
      if (data[i] === 0x0a) {
        items.message = bops.to(bops.subarray(data, i + 1)).trim();
        break;
      }
    }
    return items;
  },
};
parsers.tag = parsers.commit;

function parseObject(item) {
  var obj = {
    hash: item.hash
  };
  obj[item.type] = parsers[item.type](item);
  return obj;
}

function sha1(buf) {
  return crypto
    .createHash('sha1')
    .update(buf)
    .digest('hex');
}

function FileRepo(path, bare) {
  this.bare = !!bare;
  this.path = bare ? path + ".git" : path;
  this.gitDir = bare ? path + ".git" : pathJoin(path, '.git');
}

FileRepo.prototype.writeFile = function (path, data, options, callback) {
  // console.log("writeFile", this, arguments);
  if (this.bare) return new Error("Cannot write working files in a bare repo");
  path = pathJoin(this.path, path);
  mkdirp(dirname(path), function (err) {
    if (err) return callback(err);
    fs.writeFile(path, data, options, callback);
  });
};

FileRepo.prototype.readFile = function (path, callback) {
  // console.log("readFile", this, arguments);
  if (this.bare) return new Error("Cannot read working files in a bare repo");
  path = pathJoin(this.path, path);
  fs.readFile(path, callback);
};


FileRepo.prototype.writeGitFile = function (path, data, callback) {
  // console.log("writeGitFile", this, arguments);
  path = pathJoin(this.gitDir, path);
  mkdirp(dirname(path), function (err) {
    if (err) return callback(err);
    fs.writeFile(path, data, callback);
  });
};

FileRepo.prototype.readGitFile = function (path, callback) {
  // console.log("readGitFile", this, arguments);
  path = pathJoin(this.gitDir, path);
  fs.readFile(path, callback);
};

// Quick shared helper for load and save filepaths.
FileRepo.prototype.hashToPath = function (hash) {
  // console.log("hashToPath", this, arguments);
  return pathJoin("objects", hash.substr(0, 2), hash.substr(2));
};

FileRepo.prototype.writeRef = function (ref, hash, callback) {
  // console.log("writeRef", this, arguments);
  this.writeGitFile(ref, hash + "\n", callback);
};

FileRepo.prototype.writeSymbolicRef = function (ref, target, callback) {
  // console.log("writeSymbolicRef", this, arguments);
  this.writeGitFile(ref, "ref: " + target + "\n", callback);
};

// Save an object to the git filesystem, callback(err, hash) when done
FileRepo.prototype.writeObject = function (object, callback) {
  // console.log("writeObject", this, arguments);
  var body = bops.join([bops.from(object.type + " " + object.data.length + "\0"), object.data]);
  var hash = sha1(body);
  var self = this;
  if (object.hash && object.hash !== hash) {
    return callback(new Error("SHA1 mismatch on object: " + object.hash + " != " + hash));
  }
  var path = this.hashToPath(hash);
  zlib.deflate(body, function (err, data) {
    if (err) return callback(err);
    self.writeGitFile(path, data, function (err) {
      if (err) return callback(err);
      callback(null, hash);
    });
  });
};

// load a git object by hash, callback(err, object) when done
FileRepo.prototype.readObject = function (hash, callback) {
  // console.log("readObject", this, arguments);
  var path = this.hashToPath(hash);
  this.readGitFile(path, function (err, body) {
    if (err) return callback(err);
    zlib.inflate(body, function (err, body) {
      if (err) return callback(err);
      if (sha1(body) !== hash) return callback(new Error("SHA1 mismatch for " + path));
      var i = 0;
      var start = i;
      while (body[i++] !== 0x20);
      var type = bops.to(bops.subarray(body, start, i - 1));
      start = i;
      while (body[i++] !== 0x00);
      var size = parseInt(bops.to(bops.subarray(body, start, i - 1)), 10);
      callback(null, {
        hash: hash,
        type: type,
        size: size,
        data: bops.subarray(body, i)
      });
    });
  });
};

// Load the hash for a ref, supports recursive symbolic refs
FileRepo.prototype.readRef = function (ref, callback) {
  // console.log("readRef", this, arguments);
  var self = this;
  this.readGitFile(ref, function (err, hash) {
    if (err) return callback(err);
    hash = hash.toString().trim();
    if (hash.substr(0, 5) === "ref: ") {
      self.readRef(hash.substr(5), callback);
    }
    else {
      callback(null, hash);
    }
  });
};

FileRepo.prototype.checkout = function (ref, callback) {
  // console.log("checkout", this, arguments);
  if (this.bare) return new Error("Cannot checkout in a bare repo");
  var self = this;
  var files = [];

  this.readRef(ref, onRef);

  function onRef(err, hash) {
    if (err) return callback(err);
    self.readObject(hash, onCommit);
  }

  function onCommit(err, object) {
    if (err) return callback(err);
    object = parseObject(object);
    self.readObject(object.commit.tree, onTree);
  }

  function onTree(err, object) {
    if (err) return callback(err);
    object = parseObject(object);
    self.loadTree("", object.tree, onFile, onDone);
  }

  function onFile(file) {
    files.push(file);
  }

  function onDone(err) {
    if (err) return callback(err);
    files.sort();
    self.writeIndex(files, callback);
  }
};

FileRepo.prototype.loadTree = function (base, files, onFile, callback) {
  // console.log("loadTree", this, arguments);
  var done = false;
  var self = this;

  function finish(err) {
    if (done) return;
    done = true;
    callback(err);
  }

  // Counter for the parallel file loads.
  var left = files.length;
  function onDone(err) {
    if (err) return finish(err);
    left--;
    if (!left) finish();
  }

  files.forEach(function (file) {
    var parsed, path;

    self.readObject(file.hash, onObject);

    function onObject(err, object) {
      if (err) return finish(err);
      parsed = parseObject(object);
      path = pathJoin(base, file.path);
      if (parsed.tree) {
        self.loadTree(path, parsed.tree, onFile, onDone);
      }
      else if (parsed.blob) {
        onFile(path);
        self.writeFile(path, parsed.blob, { mode: file.mode }, onSaved);
      }
      else {
        finish(new Error("Invalid type found in tree: " + object.type));
      }
    }

    function onSaved(err) {
      if (err) return finish(err);
      onDone();
    }
  });

};

FileRepo.prototype.writeIndex = function (files, callback) {
  // console.log("writeIndex", this, arguments);
  files.sort();
  console.log(files);
  callback(new Error("TODO: Implement writeIndex"));
};
