const fsHasher = require('.');

const hasher = fsHasher.watch('.');
hasher.on('change', h => {
  console.log(h);
});

setTimeout(() => {
  hasher.destroy();
}, 5 * 1000);
