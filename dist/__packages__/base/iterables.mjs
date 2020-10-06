
export default class Iterables {

  static forEach(iterable, func) {
    return this._getIterablesClass(iterable).forEach(iterable, func);
  }

  static map(iterable, func) {
    return this._getIterablesClass(iterable).map(iterable, func);
  }

  static transform(iterable, func) {
    return this._getIterablesClass(iterable).transform(iterable, func);
  }

  static _getIterablesClass(iterable) {
    return !AsyncIterables.isAsyncIterable(iterable)
      ? SyncIterables : AsyncIterables;
  }
}

Iterables.SinkBase = class SinkBase {

  constructor() {
    this._values = [];
    this._ended = false;
    this._error = null;
    this._numValuesToError = null;
  }

  next() {
    if (this._numValuesToError != null) {
      if (this._numValuesToError-- == 0) {
        throw this._error;
      }
    }
    if (this._values.length) {
      return {value: this._values.shift(), done: false};
    } else {
      return {done: true};
    }
  }

  put(value) {
    if (!this._ended) {
      this._values.push(value);
    } else {
      throw Error('already ended');
    }
  }

  throw(error) {
    if (!this._ended) {
      this._error = error;
      this._numValuesToError = this._values.length;
      this._ended = true;
    } else {
      throw Error('already ended');
    }
  }

  end() {
    if (!this._ended) {
      this._ended = true;
    } else {
      throw Error('already ended');
    }
  }
};

export class SyncIterables {

  static forEach(iterable, func) {
    if (iterable['forEach'] == 'function') {
      iterable.forEach(func);
    } else {
      for (const x of iterable) {
        func(x);
      }
    }
  }

  static map(iterable, func) {
    if (iterable['map'] == 'function') {
      return iterable.map(func);
    } else {
      return this.mapGenerator(iterable, func);
    }
  }

  static *mapGenerator(iterable, func) {
    for (const x of iterable) {
      yield func(x);
    }
  }

  static transform(iterable, func) {
    const sink = new this.Sink();
    this.forEach(iterable, elem => func(elem, sink));
    sink.end();
    return sink;
  }
}

SyncIterables.ITERATOR_PROPERTY =
  ((typeof Symbol != 'undefined') && Symbol.iterator)
  || '@@iterator';

SyncIterables.Sink = class Sink extends Iterables.SinkBase {  
  [SyncIterables.ITERATOR_PROPERTY]() {
    return this;
  }
};

export class AsyncIterables {

  static async forEach(iterable, func) {
    let i = 0;
    for await (const x of iterable) {
      func(x, i++);
    }
  }
  
  static async *map(iterable, func) {
    let i = 0;
    for await (const x of iterable) {
      yield func(x, i++);
    }
  }

  static transform(iterable, func) {
    const sink = new this.Sink();
    // TODO: Stop iteration after sink.end() ?
    this.forEach(iterable, elem => func(elem, sink)).then(() => sink.end());
    return sink;
  }

  static isAsyncIterable(iterable) {
    return typeof iterable[this.ASYNC_ITERATOR_PROPERTY] == 'function';
  }

  static fromAsyncIterablePromise(asyncIterablePromise) {
    const forwardingAsyncIterable = new this.Sink();
    asyncIterablePromise.then(async function(asyncIterable) {
      try {
        for await (const elem of asyncIterable) {
          forwardingAsyncIterable.put(elem);
        }
        forwardingAsyncIterable.end();
      } catch (error) {
        forwardingAsyncIterable.throw(error);
      }
    });
    return forwardingAsyncIterable;
  }
}

AsyncIterables.ASYNC_ITERATOR_PROPERTY =
  ((typeof Symbol != 'undefined') && Symbol.asyncIterator)
  || '@@asyncIterator';

AsyncIterables.Sink = class Sink extends Iterables.SinkBase {
  [AsyncIterables.ASYNC_ITERATOR_PROPERTY]() {
    return this;
  }

  async next() {
    const hasNext = (
      this._values.length
        || this._numValuesToError != null
        || this._ended);
    if (!hasNext) {
      this._hasNext = new Promise(resolve => this._resolveHasNext = resolve);
      await this._hasNext;
      this._hasNext = this._resolveHasNext = null;
    }

    return super.next();
  }

  put(value) {
    super.put(value);
    if (this._resolveHasNext) {
      this._resolveHasNext();
    }
  }

  throw(error) {
    super.throw(error);
    if (this._resolveHasNext) {
      this._resolveHasNext();
    }
  }
  
  end() {
    super.end();
    if (this._resolveHasNext) {
      this._resolveHasNext();
    }
  }
};
