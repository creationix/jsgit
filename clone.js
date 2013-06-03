
var tcp = require('min-stream-node/tcp.js');
var fetch = require('git-fetch');
var chain = require('min-stream/chain.js');
var cat = require('min-stream/cat.js');
var pktLine = require('git-pkt-line');

var options = {
  host: "github.com",
  path: "/creationix/conquest.git"
};

console.log("Connecting to " + options.host);
tcp.connect(options.host, 9418, function (err, socket) {
  if (err) throw err;

  var request = "git-upload-pack " + options.path + "\0host=" + options.host + "\0";

  console.log("Connecting socket to fetch protocol.");
  chain.
    source(
      cat(
        [pktLine.frameHead(request), request],
        chain
          .source(socket.source)
          // .map(logger("<"))
          .pull(fetch(options, onStream))
      )
    )
    // .map(logger(">"))
    .sink(socket.sink)
});

function onStream(err, sources) {
  if (err) throw err;
  consume(sources.line);
  consume(sources.progress, process.stdout.write.bind(process.stdout));
  consume(sources.error, process.stderr.write.bind(process.stderr));
  consume(sources.objects);
  // , function (item) {
  //   console.log(inspect(item, {colors:true}))
  // });
}

var inspect = require('util').inspect;


function logger(message) {
  return function (item) {
    console.log(message, inspect(item, {colors:true}));
    return item;
  };
}

// Eat all events in an async stream with optional onData callback.
function consume(read, callback) {
  read(null, onRead);
  function onRead(err, item) {
    if (err) throw err;
    if (item !== undefined) {
      callback && callback(item);
      read(null, onRead);
    }
  }
}
