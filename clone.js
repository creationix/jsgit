#!/usr/bin/env node

var urlParse = require('url').parse;
var pathResolve = require('path').resolve;
var program = require('commander');

program
  .version(require('./package.json').version)
  .usage('[options] [--] <repo> [<dir>]')
  .option('--bare', 'create a bare repository')
  .option('-b, --branch <branch>', 'checkout <branch> instead of the remote\'s HEAD')
  .parse(process.argv);


if (program.args.length < 1 || program.args.length > 2) {
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
options.target = program.args[1];
if (!options.target) {
  options.target = options.pathname.match(baseExp)[1];
  if (program.bare) options.target += '.git';
}

if (program.branch) {
  program.branch = "refs/heads/" + program.branch;
  options.want = [program.branch];
}

options.target = pathResolve(process.cwd(), options.target);


var tcp = require('simple-tcp/tcp.js');
var gitPull = require('jsgit-pull/git-pull.js');
var fs = require('simple-fs')(options.target);
var each = require('simple-stream-helpers/each.js');
require('git-fs-db')(fs, { bare: true, init: true }, function (err, db) {
  if (err) throw err;
  tcp.connect(options.port, options.hostname, function (err, socket) {
    if (err) throw err;
    var out = gitPull(socket, db, options);
    socket.sink(out)(function (err, head) {
      if (err) throw err;
      console.log("Cloned to", head);
    });
    each(out.progress, function (line) {
      console.log("progress", inspect(line));
    })(console.log);
    each(out.errorStream, function (line) {
      console.error("error", inspect(line));
    })(console.log);
  });
});

var inspect = require('util').inspect;

function trace(prefix, stream) {
  return { read: read, abort: stream.abort };
  function read(callback) {
    stream.read(function (err, item) {
      console.log(prefix, inspect("" + item, {colors:true}));
      return callback(err, item);
    });
  }
}



/*


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
  var HEAD = program.branch || sources.refs.HEAD;
  var left = 1;
  function wait() {
    left++;
    return function (err) {
      if (err) throw err;
      if (!--left) onRefsWritten();
    };
  }
  Object.keys(sources.refs).forEach(function (ref) {
    var hash = sources.refs[ref];
    if (/\^\{\}$/.test(ref)) return;
    if (ref === "HEAD") return;
    repo.writeRef(ref, hash, wait);
    if (ref === program.branch || hash === HEAD) {
      repo.writeSymbolicRef("HEAD", ref, wait);
      HEAD = undefined;
    }
  });
  if (!--left) onRefsWritten();

  function onRefsWritten() {
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
  this.path = path;
  this.gitDir = bare ? path : pathJoin(path, '.git');
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
        onFile({ path: path, hash: parsed.hash });
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

FileRepo.prototype.statFile = function (path, callback) {
  path = pathJoin(this.path, path);
  fs.stat(path, callback);
};

FileRepo.prototype.writeIndex = function (files, callback) {
  // console.log("writeIndex", this, arguments);
  var self = this;
  var index = new Array(files.length + 1);

  // Index header
  var header = bops.create(12);
  // DIRC
  bops.writeUInt32BE(header, 0x44495243, 0);
  // VERSION 2
  bops.writeUInt32BE(header, 2, 4);
  // NUMBER OF ITEMS
  bops.writeUInt32BE(header, files.length, 8);
  index[0] = header;


  files.sort(function (a, b) {
    return a.path > b.path ? 1 :
           a.path < b.path ? -1 : 0;
  });

  var left = files.length;
  files.forEach(function (file, i) {
    var path = bops.from(file.path);
    // Length is item header + filename
    var length = 62 + path.length;
    // Pad to multiple of 8 to keep alignment within file.
    length += 8 - (length % 8);
    var item = index[i + 1] = bops.create(length);
    self.statFile(file.path, function (err, stat) {
      if (err) return onDone(err);

// 32-bit ctime seconds, the last time a file's metadata changed
//   this is stat(2) data
      var time = stat.ctime / 1000;
      var seconds = Math.floor(time);
      bops.writeUInt32BE(item, seconds, 0);
// 32-bit ctime nanosecond fractions
//   this is stat(2) data
      var nanos = Math.floor((time - seconds) * 1000000000);
      bops.writeUInt32BE(item, nanos, 4);

// 32-bit mtime seconds, the last time a file's data changed
//   this is stat(2) data
      time = stat.mtime / 1000;
      seconds = Math.floor(time);
      bops.writeUInt32BE(item, seconds, 8);
// 32-bit mtime nanosecond fractions
//   this is stat(2) data
      nanos = Math.floor((time - seconds) * 1000000000);
      bops.writeUInt32BE(item, nanos, 12);
// 32-bit dev
//   this is stat(2) data
      bops.writeUInt32BE(item, stat.dev, 16);
// 32-bit ino
//   this is stat(2) data
      bops.writeUInt32BE(item, stat.ino, 20);
// 32-bit mode, split into (high to low bits)
// 4-bit object type
//   valid values in binary are 1000 (regular file), 1010 (symbolic link)
//   and 1110 (gitlink)
// 3-bit unused
// 9-bit unix permission. Only 0755 and 0644 are valid for regular files.
// Symbolic links and gitlinks have value 0 in this field.
// TODO: Implement check for symlinks
      // normal file 0x8000 (10000000)
      // symlink     0xa000 (10100000)
      // gitlink     0xe000 (11100000)
      // executable 0x1ed (0755)
      // normal     0x1a4 (0644)
      // bops.writeUInt32BE(item, 0x8000 | (stat.mode & 0x40 ? 0x1ed : 0x1a4), 28);
      bops.writeUInt32BE(item, stat.mode, 24);

// 32-bit uid
//   this is stat(2) data
      bops.writeUInt32BE(item, stat.uid, 28);
// 32-bit gid
//   this is stat(2) data
      bops.writeUInt32BE(item, stat.gid, 32);
// 32-bit file size
//   This is the on-disk size from stat(2), truncated to 32-bit.
      bops.writeUInt32BE(item, stat.size, 36);
// 160-bit SHA-1 for the represented object
      bops.copy(bops.from(file.hash, "hex"), item, 40);
// A 16-bit 'flags' field split into (high to low bits)
// 1-bit assume-valid flag
// 1-bit extended flag (must be zero in version 2)
// 2-bit stage (during merge)
// 12-bit name length if the length is less than 0xFFF; otherwise 0xFFF
// is stored in this field.
      bops.writeUInt16BE(item, Math.max(0xfff, path.length), 60);
// Entry path name (variable length) relative to top level directory
//   (without leading slash). '/' is used as path separator. The special
//   path components ".", ".." and ".git" (without quotes) are disallowed.
//   Trailing slash is also disallowed.
// The exact encoding is undefined, but the '.' and '/' characters
// are encoded in 7-bit ASCII and the encoding cannot contain a NUL
// byte (iow, this is a UNIX pathname).
      bops.copy(path, item, 62);
// 1-8 nul bytes as necessary to pad the entry to a multiple of eight bytes
// while keeping the name NUL-terminated.
      for (var i = 62 + path.length; i < item.length; i++) {
        item[i] = 0;
      }

      if (!--left) onDone();
    });
  });

  var done = false;
  function onDone(err) {
    if (done) return;
    done = true;
    if (err) return callback(err);
    var buf = bops.join(index);
    var checksum = bops.from(sha1(buf), "hex");
    self.writeGitFile("index", bops.join([buf, checksum]), callback);
  }
};
*/