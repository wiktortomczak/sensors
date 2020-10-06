
import {AsyncIterables} from 'http://localhost:8000/dist/__packages__/base/iterables.mjs';
import Arrays from 'http://localhost:8000/dist/__packages__/base/arrays.mjs';
import Promises from 'http://localhost:8000/dist/__packages__/base/promises.mjs';

const {beforeEach, describe, it} = window.Mocha;
const chai = window.chai;


describe('AsyncIterables.Sink', function () {
  let sink;
  
  beforeEach(function() {
    sink = new AsyncIterables.Sink();
  });

  it('empty', async function () {
    await _assertSinkRead();

    sink.end();
    await _assertSinkRead({end: true});

    chai.assert.throws(() => sink.put(1), 'already ended');
    chai.assert.throws(() => sink.throw(Error()), 'already ended');
  });

  it('put', async function () {
    sink.put(1);
    await _assertSinkRead({values: [1]});
    
    sink.put(2);
    sink.put(3);
    await _assertSinkRead({values: [2, 3]});

    sink.put(4);
    sink.end();
    await _assertSinkRead({values: [4], end: true});
  });

  it('throw', async function () {
    const error = Error('test error');
    sink.throw(error);
    await _assertSinkRead({error, end: true});
    chai.assert.throws(() => sink.put(1), 'already ended');
  });

  it('put + throw', async function () {
    const error = Error('test error');
    sink.put(1);
    sink.put(2);
    sink.throw(error);
    await _assertSinkRead({values: [1, 2], error, end: true});
  });

  function _assertSinkRead(expected) {
    return _assertAsyncIterableRead.bind(sink, expected);
  }
});


describe('AsyncIterables', function () {
  it('forEach', async function () {
    const result = Arrays.create(3, () => Promises.withResolver());
    const asyncIterable = new AsyncIterables.Sink();
    const done = AsyncIterables.forEach(asyncIterable, (x, i) => {
      result[i].resolve(x + 10);
    });
    chai.assert.isTrue(await Promises.isPending(result[0]));
    chai.assert.isTrue(await Promises.isPending(done));
    asyncIterable.put(1);
    chai.assert.equal(11, await result[0]);
    chai.assert.isTrue(await Promises.isPending(result[1]));
    chai.assert.isTrue(await Promises.isPending(done));
    asyncIterable.put(2);
    asyncIterable.put(3);
    chai.assert.equal(12, await result[1]);
    chai.assert.equal(13, await result[2]);
    chai.assert.isTrue(await Promises.isPending(done));
    asyncIterable.end();
    await done;
  });

  it('map', async function () {
    const asyncIterable = new AsyncIterables.Sink();
    const result = AsyncIterables.map(asyncIterable, (x, i) => {
      return x + i + 10;
    });
    await _assertAsyncIterableRead(result);
    asyncIterable.put(1);
    await _assertAsyncIterableRead(result, {values: [11]});
    asyncIterable.put(2);
    asyncIterable.put(3);
    await _assertAsyncIterableRead(result, {values: [13, 15]});
    asyncIterable.end();
    await _assertAsyncIterableRead(result, {end: true});
  });

  it('transform', async function () {
    const asyncIterable = new AsyncIterables.Sink();
    const result = AsyncIterables.transform(asyncIterable, (x, sink) => {
      if (x == 2) {
        sink.put(12);
      } else if (x == 3) {
        sink.put(13);
        sink.put(13);
      }
    });
    asyncIterable.put(1);
    await _assertAsyncIterableRead(result);
    asyncIterable.put(2);
    await _assertAsyncIterableRead(result, {values: [12]});
    asyncIterable.put(3);
    await _assertAsyncIterableRead(result, {values: [13, 13]});
    asyncIterable.end();
    await _assertAsyncIterableRead(result, {end: true});
  });

  it('fromAsyncIterablePromise', async function () {
    const asyncIterablePromise = Promises.withResolver();
    const result = AsyncIterables.fromAsyncIterablePromise(asyncIterablePromise);

    await _assertAsyncIterableRead(result);
    const asyncIterable = new AsyncIterables.Sink();
    asyncIterable.put(1);
    asyncIterablePromise.resolve(asyncIterable);
    await _assertAsyncIterableRead(result, {values: [1]});
    asyncIterable.put(2);
    asyncIterable.put(3);
    await _assertAsyncIterableRead(result, {values: [2, 3]});
    const error = Error('test error');
    asyncIterable.throw(error);
    await _assertAsyncIterableRead(result, {error, end: true});
  });
});

  
async function _assertAsyncIterableRead(asyncIterable, expected) {
  let values = [], error;
  while (true) {
    const next = pendingNext || asyncIterable.next();
    if (!await Promises.isPending(next)) {
      try {
        var {value, done} = await next;
      } catch (e) {
        chai.assert.isUndefined(error);
        error = e;
        continue;
      } finally {
        pendingNext = null;
      }
    } else {  // isPending
      pendingNext = next;
      break;
    }
    if (!done) {
      chai.assert.isUndefined(error);
      values.push(value);     
    } else {
      chai.assert.isUndefined(value);
      break;
    }
  }

  expected = expected || {};
  chai.assert.deepEqual(values, (expected.values || []));
  chai.assert.equal(error, expected.error);    
  chai.assert.equal(!!done, !!expected.end);    
}

let pendingNext;
