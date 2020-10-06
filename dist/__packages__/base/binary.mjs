
import Iterables from 'http://localhost:8000/dist/__packages__/base/iterables.mjs';


export class Uint8Message {

  static fromUint8Iterable(uint8Iterable) {
    let partialData = null;
    return Iterables.mapToSink(uint8Iterable, (data, sink) => {
      if (partialData) {
        data = _concatUint8Arrays(partialData, data);
        partialData = null;
      }
      for (let messageLength;
           messageLength = this._getMessageLengthIfComplete(data); ) {
        const message = data.slice(0, messageLength);
        sink.put(message);
        data = data.slice(messageLength);
      }
      if (data.length) {
        partialData = data;
      }
    });
  }

  static _getMessageLengthIfComplete(data) {
    if (data.length >= 2) {
      const messageLength = _unpackUint16(data.buffer);
      if (data.length >= messageLength)
        return messageLength;
    }
    return null;
  }
}


export class BinaryReader {

  static fromTypedArray(arr) {
    return new this(arr.buffer);
  }

  constructor(buffer) {
    this._buffer = buffer;
    this._offset = 0;
  }

  readUint16() {
    const uint16 = _unpackUint16(this._buffer, this._offset);
    this._offset += 2;
    return uint16;
  }

  readUint8Array() {
    const numElements = this.readUint16() - 2;
    const array = new Uint8Array(
      this._buffer.slice(this._offset, this._offset + numElements));
    this._offset += numElements;
    return array;
  }
}


function _concatUint8Arrays(a, b) {
  const result = new Int8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}


function _unpackUint16(buffer, offset=0) {
  return new Uint16Array(buffer.slice(offset, offset+2))[0];
};
