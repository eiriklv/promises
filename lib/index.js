var asap = require('asap');

// Promise states
var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

module.exports = Promise;

/**
 * Constructor function
 * for creating a new Promise
 *
 * @param {Function} fn Executor function
 */
function Promise(fn) {
  if (!(this instanceof Promise))
    return new Promise(fn);

  var state = PENDING;
  var value = null;
  var handlers = [];

  /**
   * Fulfill the Promise
   * @param {valueOfPromise} result
   */
  function fulfill(result) {
    state = FULFILLED;
    value = result;
    handlers.forEach(handle);
    handlers = null;
  }

  /**
   * Reject the Promise
   * @param {reason} error
   */
  function reject(error) {
    state = REJECTED;
    value = error;
    handlers.forEach(handle);
    handlers = null;
  }

  /**
   * Resolve the Promise
   * 
   * check if what you are resolving
   * returns a value or another promise
   * - if it is a value then fulfill the promise
   * - if it is a promise, then resolve the promise first (could be nested)
   * 
   * @param {valueOrPromise} result
   */
  function resolve(result) {
    try {
      var then = getThen(result);
      if (then) return doResolve(then.bind(result), resolve, reject);
      fulfill(result);
    } catch (e) {
      reject(e);
    }
  }

  /**
   * Handle the Promise
   * @param {function} handler
   */
  function handle(handler) {
    if (state === PENDING) {
      handlers.push(handler);
      return;
    }

    var cb = state === FULFILLED ?
      handler.onFulfilled :
      handler.onRejected;

    asap(function() {
      cb(value);
    });
  }

  /**
   * this method is used to notify
   * the registered handlers
   * of .then about the fulfillment
   * of the promise
   * 
   * @param  {[type]}   onFulfilled [description]
   * @param  {[type]}   onRejected  [description]
   * @return {Function}             [description]
   */
  this.done = function(onFulfilled, onRejected) {
    asap(function() {
      handle({
        onFulfilled: onFulfilled,
        onRejected: onRejected
      });
    });
  }

  /**
   * attach fulfillment/rejection callbacks
   * to the promise
   * returns a promise
   * 
   * @param  {[type]} onFulfilled [description]
   * @param  {[type]} onRejected  [description]
   * @return {[type]}             [description]
   */
  this.then = function(onFulfilled, onRejected) {
    var self = this;

    return Promise(function(resolve, reject) {
      return self.done(function(result) {
        if (typeof onFulfilled === 'function') {
          try {
            return resolve(onFulfilled(result));
          } catch (ex) {
            return reject(ex);
          }
        } else {
          return resolve(result);
        }
      }, function(error) {
        if (typeof onRejected === 'function') {
          try {
            return resolve(onRejected(error));
          } catch (ex) {
            return reject(ex);
          }
        } else {
          return reject(error);
        }
      });
    });
  };

  // try to resolve the Promise
  doResolve(fn, resolve, reject);
}


/**
 * convenience method for attaching
 * only a rejection/error handler
 *
 * @param  {[type]} onRejected [description]
 * @return {[type]}            [description]
 */
Promise.prototype.catch = function(onRejected) {
  return this.then(null, onRejected);
};


/**
 * convenience method for attaching
 * only a handler that executes
 * no matter what the outcome of the
 * promise is, while forwarding errors
 * passed to it, or throwing its
 * own error
 *
 * @param  {[type]} onAny [description]
 * @return {[type]}       [description]
 */
Promise.prototype.finally = function(onAny) {
  this.then(onAny, onAny);
  return this.then(null, null);
};

/**
 * convenience method for attaching
 * only an error handler at the end
 * of a promise chain, to ensure
 * catching uncaught errors
 *
 * @return {[type]} [description]
 */
Promise.prototype.end = function() {
  return this.then(null, function(err) {
    console.error(err);
  });
};

/**
 * convenience method for spreading
 * an array of results to a list
 * of arguments
 *
 * @param  {[type]} onFulfilled [description]
 * @return {[type]}             [description]
 */
Promise.prototype.spread = function(onFulfilled) {
  var self = this;

  return this.then(function(values) {
    if (Array.isArray(values)) {
      return onFulfilled.apply(self, values);
    } else {
      return onFulfilled.apply(self, [values]);
    }
  });
};


/**
 * A promise that can resolve to a value directly
 * or a rejection because of a thrown error
 *
 * @param {[type]} value [description]
 */
function ValuePromise(value) {
  if (!(this instanceof ValuePromise))
    return new ValuePromise(value);

  this.then = function(onFulfilled) {
    if (typeof onFulfilled !== 'function') return this;
    return Promise(function(resolve, reject) {
      asap(function() {
        try {
          resolve(onFulfilled(value))
        } catch (ex) {
          reject(ex);
        }
      })
    })
  }
}

ValuePromise.prototype = Promise.prototype;

// define some standard values
var TRUE = ValuePromise(true);
var FALSE = ValuePromise(false);
var NULL = ValuePromise(null);
var UNDEFINED = ValuePromise(undefined);
var ZERO = ValuePromise(0);
var EMPTYSTRING = ValuePromise('');

/**
 * method to create a promise that is
 * resolved to the input value
 *
 * @param  {[type]} value [description]
 * @return {[type]}       [description]
 */
Promise.resolve = function(value) {
  if (value instanceof Promise) return value;

  if (value === null) return NULL;
  if (value === undefined) return UNDEFINED;
  if (value === true) return TRUE;
  if (value === false) return FALSE;
  if (value === 0) return ZERO;
  if (value === '') return EMPTYSTRING;

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = getThen(value);
      if (then) {
        return Promise(then.bind(value));
      }
    } catch (ex) {
      return Promise(function(resolve, reject) {
        reject(ex);
      });
    }
  }

  return ValuePromise(value);
}

/**
 * method to create a promise that is
 * rejected with the input value/reason
 *
 * @param  {[type]} value [description]
 * @return {[type]}       [description]
 */
Promise.reject = function(value) {
  return new Promise(function(resolve, reject) {
    reject(value);
  });
}

/**
 * Check if a value is a Promise and, if it is,
 * return the `then` method of that promise.
 *
 * @param {Promise|Any} value
 * @return {Function|Null}
 */
function getThen(value) {
  var t = typeof value;
  if (value && (t === 'object' || t === 'function')) {
    var then = value.then;
    if (typeof then === 'function') {
      return then;
    }
  }
  return null;
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 *
 * @param {Function} fn A resolver function that may not be trusted
 * @param {Function} onFulfilled
 * @param {Function} onRejected
 */
function doResolve(fn, onFulfilled, onRejected) {
  var done = false;

  try {
    fn(function(value) {
      if (done) return;
      done = true;
      onFulfilled(value);
    }, function(reason) {
      if (done) return;
      done = true;
      onRejected(reason);
    })
  } catch (ex) {
    if (done) return;
    done = true;
    onRejected(ex);
  }
}

/**
 * Takes an array of promises or values
 * and passes a corresponding
 * object of resolved
 * or rejected values/reasons
 * @param  {Array} arr - Array of Promises or values
 * @return {Promise} a resulting Promise
 */
Promise.some = function(arr) {
  var len = arr.length;
  var settled = false;
  var rejections = [];
  var rejectIndex = 0;
  var rejectCount = 0;

  return Promise(function(resolve, reject) {
    if (len === 0) return resolve();

    function customResolve(value) {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    }

    function customReject(index) {
      return function(reason) {
        if (!settled) {
          rejections[index] = reason;
          rejectCount++;

          if (rejectCount >= len) {
            reject(rejections);
          }
        }
      }
    }

    function resolveNext(promises) {
      Promise.resolve(promises.shift())
        .then(customResolve, customReject(rejectIndex++));

      if (!settled && (promises.length > 0)) {
        asap(function() {
          resolveNext(promises);
        });
      }
    }

    resolveNext(arr.slice());
  })
}

/**
 * Takes an array of promises or values
 * and passes a corresponding
 * object of resolved
 * or rejected values/reasons
 * @param  {Array} arr - Array of Promises or values
 * @return {Promise} a resulting Promise
 */
Promise.all = function(arr) {
  var len = arr.length;
  var output = [];
  var index = 0;
  var completed = 0;
  var rejected = false;

  return Promise(function(resolve, reject) {
    if (len === 0) return resolve([]);

    function customResolve(index) {
      return function(value) {
        output[index] = value;

        if (++completed === len) {
          resolve(output);
        }
      }
    }

    function customReject(reason) {
      if (!rejected) {
        rejected = true;
        reject(reason);
      }
    }

    function resolveNext(promises) {
      Promise.resolve(promises.shift())
        .then(customResolve(index++), reject);

      if (!rejected && (promises.length > 0)) {
        asap(function() {
          resolveNext(promises);
        });
      }
    }

    resolveNext(arr.slice());
  })
}

/**
 * Promise.race takes an array
 * of promises and fulfills it
 * with the first of them to
 * resolve to either fulfillment
 * or rejection, and passes
 * the result to another promise
 * that takes the main resolve
 * and reject methods as input
 * @param  {[type]} arr - an array of values or Promises
 * @return {[type]} Promise
 */
Promise.race = function(values) {
  return new Promise(function(resolve, reject) {
    function resolver(promiseArray) {
      Promise.resolve(promiseArray.pop()).then(resolve, reject);

      if (promiseArray.length > 0) {
        asap(resolver.bind(this, promiseArray));
      }
    }
    resolver(values.slice());
  });
}

/**
 * A helper function to
 * "promisify" a standard
 * node callback function
 * @param  {Function} fn - node callback API function
 * @return {Promise} a resulting Promise
 */
Promise.ify = function(fn) {
  return function() {
    var self = this;
    var args = [].slice.call(arguments);

    return Promise(function(resolve, reject) {
      var callback = function(err, result) {
        if (err) return reject(err);
        resolve(result);
      };

      fn.apply(self, args.concat(callback));
    });
  };
};
