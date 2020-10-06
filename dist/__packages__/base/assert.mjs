
export default function assert(condition, opt_message) {
  if (!condition) {
    const message =
      opt_message instanceof Function ? opt_message() :
      opt_message ? opt_message : 'Assertion failed';
    throw Error(message);
  }
}
