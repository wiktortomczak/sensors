
import Arrays from 'http://localhost:8000/dist/__packages__/base/arrays.mjs';

// TODO: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
export default class Stream {
  
  constructor() {
    this._onData = [];
    this._onEnd = [];
  }

  put(data) {
    this._onData.forEach(callback => callback(data));
  }

  end() {
    this._onEnd.forEach(callback => callback());
  }

  onData(callback) {
    this._onData.push(callback);
    return callback;
  }

  removeOnData(callback) {
    Arrays.remove(this._onData, callback);
  }

  onEnd(callback) {
    this._onEnd.push(callback);
    return callback;
  }
}
