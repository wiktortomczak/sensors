
import assert from 'http://localhost:8000/base/dist/assert.mjs';
import {AsyncIterables} from 'http://localhost:8000/base/dist/iterables.mjs';
import Stream from 'http://localhost:8000/base/dist/stream.mjs';


export default class Fetch {

  /**
   * Fetches a URI asynchronously via HTTP GET request.
   *
   * @param {!String} uri
   * @return {!FetchResponse} Response (URI content).
   */ 
  static get(uri) {
    return this.fetch(uri, {method: 'GET'});
  };

  /**
   * Sends an HTTP POST request.
   *
   * @param {!String} uri
   * @param {!Object} body
   * @param {String=} opt_contentType
   * @return {!FetchResponse} Response.
   */ 
  static post(uri, body, opt_contentType) {
    const init = {
      body: body,
      method: 'POST',
      mode: 'cors'
    };
    if (opt_contentType) {
      init.headers = {'content-type': opt_contentType};
    }
    return this.fetch(uri, init);
  }

  static fetch(uri, init) {
    const abortController = new AbortController();
    const responsePromise = fetch(uri, {
      ...init, signal: abortController.signal});
    return new FetchResponse(responsePromise, abortController);
  }
}


export class FetchResponse {

  constructor(responsePromise, abortController) {
    this._responsePromise = responsePromise;
    this._abortController = abortController;
    // TODO: Replace _responseRead with reader.closed?
    // (reader of type ReadableStreamDefaultReader returned by getReader()).
    [this._responseRead, this._responseReadResolver] = promiseWithResolver();
    responsePromise.catch(error => this._responseReadResolver.reject(error));
  }

  static fromPromise(fetchResponsePromise) {
    const responsePromise = new Promise((resolve, reject) => {
      fetchResponsePromise
        .then(fetchResponse => fetchResponse._responsePromise.then(resolve))
        .catch(reject);
    });
    const abortController = {
      abort: () => fetchResponsePromise
        .then(fetchResponse => fetchResponse.cancel())
    };
    return new this(responsePromise, abortController);
  }

  getText() {
    return this._responsePromise.then(response => {
      this._assertResponseOk(response);
      const text = response.text();
      this._responseReadResolver.resolve();
      return text;
    });
  }

  getJson() {
    return this.getText().then(JSON.parse);
  }
  
  iterUint8Array() {
    // TODO: Make the returned iterator cancellable, via iter.cancel()?
    return AsyncIterables.Sink.fromAsyncIterablePromise(
      this._responsePromise.then(response => {
        this._assertResponseOk(response);
        return this._iterReader(response.body.getReader());
      }));
  }

  streamUint8Array() {
    return Stream.fromAsyncIterable(this.iterUint8Array(), () => this.cancel());
  }
  
  iterJson(framing, shouldParse) {
    assert(!framing || framing == 'line-delimited');
    if (!isDefined(shouldParse)) {
      shouldParse = true;
    }

    var partialLine;
    return AsyncIterables.transform(this.iterUint8Array(), (data, sink) => {
      const text = this.constructor._textDecoder.decode(data);
      let completeLines;
      [completeLines, partialLine] = _splitLines(text, partialLine);
      completeLines.forEach(line => {
        sink.put(shouldParse ? JSON.parse(line) : line);
      });
    });
  }

  streamJson(framing, shouldParse) {
    return Stream.fromAsyncIterable(
      this.iterJson(framing, shouldParse), () => this.cancel());
  }
  
  // getUint8Stream() {
  //   const stream = new Stream();
  //   this._responsePromise.then(response => {
  //     this._assertResponseOk(response);  // TODO: Write into stream.
  //     this._readerToStream(response.body.getReader(), stream);
  //   });
  //   return stream;
  // }

  // getJsonStream({framing, shouldParse}) {
  //   return JsonStream.fromDataStream(
  //     this.getUint8Stream(), {framing, shouldParse});
  // }

  cancel() {
    this._abortController.abort();
  }

  get cancelablePromise() {
    if (!this._cancelablePromise) {
      this._cancelablePromise = {
        then: func => this._responseRead.then(func),
        finally: func => this._responseRead.finally(func),
        cancel: () => this.cancel()
      };
    }
    return this._cancelablePromise;
  }

  // async _readerToStream(reader, stream) {
  //   try {
  //     while (true) {
  //       // Can throw exception, eg. if canceled.
  //       const {done, value} = await reader.read();
  //       if (!done) {
  //         stream.put(value); 
  //       } else {
  //         break;
  //       }
  //     }
  //     stream.end();
  //     this._responseReadResolver.resolve();
  //   }
  //   catch (e) {
  //     // TODO: stream.fail();
  //     this._responseReadResolver.reject(e);
  //   }
  // }

  async *_iterReader(reader) {
    try {
      while (true) {
        // Can throw exception, eg. if canceled.
        const {done, value} = await reader.read();
        if (!done) {
          yield value;
        } else {
          break;
        }
      }
      this._responseReadResolver.resolve();
    }
    catch (e) {
      this._responseReadResolver.reject(e);
      throw e;
    }
  }
  
  _assertResponseOk(response) {
    assert(response.ok, () => response.status + ' ' + response.statusText);
  }
}

FetchResponse._textDecoder = new TextDecoder();


function _splitLines(text, prevPartialLine) {
  const completeLines = text.split('\n');
  if (prevPartialLine) {
    completeLines[0] = prevPartialLine + completeLines[0];
  }
  if (!text.endsWith('\n')) {
    var partialLine = completeLines.pop();
  } else {
    completeLines.pop();
  }
  return [completeLines, partialLine];
}


// class JsonStream extends Stream {

//   static fromDataStream(dataStream, {framing, shouldParse}) {
//     assert(!framing || framing == 'line-delimited');
//     return new this(dataStream, !isUndefined(shouldParse) ? shouldParse : true);
//   }

//   constructor(dataStream, shouldParse) {
//     super();
//     dataStream.onData(this._handleData.bind(this));
//     dataStream.onEnd(this._handleEnd.bind(this));
//     this._shouldParse = shouldParse;
//     this._textRemainder = '';
//   }

//   _handleData(data) {
//     let text = JsonStream._decoder.decode(data);
//     for ( ;; ) {
//       const newlineIndex = text.indexOf('\n');
//       if (newlineIndex == -1)
//         break;

//       const textUntilNewline = text.slice(0, newlineIndex);
//       text = text.slice(newlineIndex + 1);
      
//       const textJson = this._textRemainder + textUntilNewline;
//       this.put(this._shouldParse ? JSON.parse(textJson) : textJson);

//       this._textRemainder = '';
//     }
//     this._textRemainder += text;
//   }

//   _handleEnd() {
//     assert(!this._textRemainder);
//     this.end();
//   }
// }

// JsonStream._decoder = new TextDecoder();


function isDefined(v) {
  return typeof v != 'undefined';
}


function promiseWithResolver() {
  const resolver = {};
  const promise = new Promise((resolve, reject) => {
    resolver.resolve = resolve;
    resolver.reject = reject;
  });
  return [promise, resolver];
}
