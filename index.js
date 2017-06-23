const path = require('path');
const fs = require('fs');

const murmur = require('murmurhash');
const MultiMutex = require('multimutex');

class FileStat {
  constructor(name, timestamp) {
    this.name = name;
    this.timestamp = timestamp;
  }
}

const _requestHash = p => new Promise((accept, reject) => {
  if (path.isAbsolute(p)) {
    const fileStats = [];
    let pending = 0;
    const pend = () => {
      if (--pending === 0) {
        _done();
      }
    };
    const _done = () => {
      const sortedFileStats = fileStats.sort((a, b) => a.name.localeCompare(b.name));
      const sortedFileTimestamps = sortedFileStats.map(fileStat => fileStat.timestamp);
      const s = sortedFileTimestamps.join(':');
      const h = murmur(s);
      accept(h);
    };
    const _recurseDirectory = p => {
      pending++;

      fs.readdir(p, (err, nodes) => {
        if (!err) {
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            _recurseNode(path.join(p, node));
          }

          pend();
        } else {
          reject(err);
        }
      });
    };
    const _recurseNode = p => {
      pending++;

      fs.lstat(p, (err, stats) => {
        if (!err) {
          if (stats.isFile()) {
            const fileStat = new FileStat(p, stats.mtime.getTime());
            fileStats.push(fileStat);
          } else if (stats.isDirectory()) {
            _recurseDirectory(p);
          }

          pend();
        } else {
          reject(err);
        }
      });
    };

    _recurseDirectory(p);
  } else {
    accept(null);
  }
});

class FsHash {
  constructor({basePath = '/', dataPath = path.join(__dirname, 'data.json')} = {}) {
    this.basePath = basePath;
    this.dataPath = dataPath;

    this.save = _debounce(this.save.bind(this));

    this._data = {};
    this._mutex = new MultiMutex();
    this._loadPromise = _makePromise();

    this.load();
  }

  update(p, fn) {
    const {basePath, _data: data, _loadPromise: loadPromise} = this;

    return loadPromise
      .then(() => this._mutex.lock(p)
        .then(unlock => _requestHash(path.join(basePath, p))
          .then(newHash => {
            const oldHash = (p in data) ? data[p] : null;

            if (newHash !== oldHash) {
              return Promise.resolve(fn(newHash, oldHash))
                .then(() => {
                  data[p] = newHash;

                  this.save();

                  unlock();
                })
                .catch(err => {
                  unlock();

                  return Promise.reject(err);
                });
            } else {
              unlock();
            }
          })
        )
      );
  }

  updateAll(ps, fn) {
    ps = ps.slice().sort(); // to prevent deadlock

    const {basePath, _data: data, _loadPromise: loadPromise} = this;

    return loadPromise
      .then(() => {
        const promises = [];
        const unlocks = [];
        const saves = [];
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          const promise = this._mutex.lock(p)
            .then(unlock => {
              unlocks.push(unlock);

              return _requestHash(path.join(basePath, p))
                .then(newHash => {
                  if (newHash === null || newHash !== ((p in data) ? data[p] : null)) {
                    if (newHash !== null) {
                      saves.push(() => {
                        data[p] = newHash;
                      });
                    }

                    return p;
                  } else {
                    return null;
                  }
                })
            });
          promises.push(promise);
        }
        const _cleanup = () => {
          for (let i = 0; i < unlocks.length; i++) {
            const unlock = unlocks[i];
            unlock();
          }
          for (let i = 0; i < saves.length; i++) {
            const save = saves[i];
            save();
          }

          this.save();
        };

        return Promise.all(promises)
          .then(paths => Promise.resolve(fn(paths.filter(p => p !== null))))
          .then(() => _cleanup())
          .catch(err => {
            _cleanup();

            return Promise.reject(err);
          });
      });
  }

  load() {
    const {dataPath, _loadPromise: loadPromise} = this;

    fs.readFile(dataPath, 'utf8', (err, s) => {
      if (!err) {
        let j = _jsonParse(s);
        if (j === undefined) {
          j = {};
        }
        this._data = j;

        loadPromise.accept();
      } else if (err.code === 'ENOENT') {
        loadPromise.accept();
      } else {
        loadPromise.reject(err);
      }
    });
  }

  save(next) {
    const {dataPath, _data: data} = this;

    fs.writeFile(dataPath, JSON.stringify(data), err => {
      if (err) {
        console.warn(err);
      }

      next();
    });
  }
}

const _jsonParse = s => {
  try {
    return JSON.parse(s);
  } catch(err) => {
    return undefined;
  }
};
const _makePromise = () => {
  let a = null;
  let r = null;
  const result = new Promise((accept, reject) => {
    a = accept;
    r = reject;
  });
  result.accept = a;
  result.reject = r;
  return result
};
const _debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

const _fshash = opts => new FsHash(opts);

module.exports = _fshash;
