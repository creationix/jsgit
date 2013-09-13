git-cli
=======

A command-line git client powered by js-git and node.js

## Install

```sh
> npm install -g git-cli
```

## Usage

```sh
> jsgit --help

  Usage: jsgit [options] [command]

  Commands:

    clone <url>            Clone a repository into a new directory
    ls-remote <url>        List remote refs
    help [cmd]             display help for [cmd]

  Options:

    -h, --help     output usage information
    -V, --version  output the version number

> jsgit clone --help

  Usage: jsgit-clone [options] [--] <url> [<dir>]

  Options:

    -h, --help             output usage information
    -V, --version          output the version number
    --bare                 create a bare repository
    -b, --branch <branch>  checkout <branch> instead of the remote's HEAD
    -t, --tag <tag>        checkout <tag> instead of the remote's HEAD

```

## Examples

```sh
> jsgit clone git://github.com/creationix/conquest.git
Counting objects: 80, done.
Compressing objects: 100% (48/48), done.
Total 80 (delta 28), reused 78 (delta 26)
Receiving objects: 100% (80/80)   
DONE
```

## Debugging

If something goes wrong, file an issue.  If the issue has to do with command-line option parsing, file it here, but it it's an issue with actual features (like a failed clone), file it against the main [js-git][] repo.

Please include what version of node you're using, what OS, and debug trace output by using the `TRACE=1` prefix.

```js
> TRACE=1 jsgit clone git://github.com/creationix/conquest.git
```

[js-git]: https://github.com/creationix/js-git/issues
