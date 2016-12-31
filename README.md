#### fs-hasher

```js
const fsHasher = require('fs-hasher');

let lastHashCode = 'someSavedHash';
const hasher = fsHasher.watch('.', lastHashCode);
hasher.on('change', hashCode => {
  console.log(hashCode);

  lastHashCode = hashCode;
});

setTimeout(() => {
  hasher.destroy();
}, 5 * 1000);
```
