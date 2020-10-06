
import assert from 'http://localhost:8000/dist/__packages__/base/assert.mjs';


export default class Arrays {

  static create(length, createElemFunc) {
    const arr = new Array(length);
    for (let i = 0; i < length; ++i) {
      arr[i] = createElemFunc(i);
    }
    return arr;
  }
  
  static remove(arr, element) {
    const index = arr.indexOf(element);
    assert(index != -1);
    arr.splice(index, 1);
  }

  static *chunkIter(arr, chunkSize) {
    for (let offset = 0; offset < arr.length; offset += chunkSize) {
      yield arr.slice(offset, offset + chunkSize);
    }
  }

}
