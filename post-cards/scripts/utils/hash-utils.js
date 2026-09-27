(function () {
  "use strict";

  function hashSeed(str) {
    str = String(str || "seed");
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // A one-shot index into arr, straight from the seed's hash mod arr.length —
  // no RNG closure needed when a single pick is all that's wanted.
  function pickByModulo(seed, arr) {
    var str = String(seed || "seed");
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return arr[(h >>> 0) % arr.length];
  }

  function shuffledIndices(rng, n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var i2 = n - 1; i2 > 0; i2--) {
      var j = Math.floor(rng() * (i2 + 1));
      var tmp = arr[i2]; arr[i2] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  window.HashUtils = {
    hashSeed: hashSeed,
    pick: pick,
    pickByModulo: pickByModulo,
    shuffledIndices: shuffledIndices
  };
})();
