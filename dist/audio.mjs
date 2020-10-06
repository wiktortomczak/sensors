
import assert from 'http://localhost:8000/dist/__packages__/base/assert.mjs';


export default class Audio {

  constructor(volume) {
    this._audioContext =
      new (window.AudioContext || window.webkitAudioContext)();
    this._gainNode = this._audioContext.createGain();
    this._gainNode.gain.value = volume || .2;
    this._gainNode.connect(this._audioContext.destination);
  }
}

Audio.DEFAULT = new Audio();


export class Oscillator {

  constructor(frequency, audio) {
    this._oscillator = null;
    this._frequency = frequency || 100;
    this._audio = audio || Audio.DEFAULT;
  }

  beep(millis) {
    this.start();
    window.setTimeout(() => this.stop(), millis);
  }

  start() {
    assert(!this._oscillator);
    this._createOscillator();
    this._oscillator.start();
  }

  stop() {
    this._oscillator.stop();
    this._oscillator = null;  // TODO
  }

  setFrequency(frequency) {
    this._frequency = frequency;
    if (this._oscillator) {
      this._oscillator.frequency.value = frequency;
    }
  }

  _createOscillator() {
    this._oscillator = this._audio._audioContext.createOscillator();
    this._oscillator.frequency.value = this._frequency;
    this._oscillator.type = 'sine';
    this._oscillator.connect(this._audio._gainNode);
  }
}


export class TimeseriesBuzzer {

  constructor(millisPerUnit) {
    this._millisPerUnit = millisPerUnit;
    this._lastBuzz = Date.now();
    this._buzzStart = null;
    this._buzzEnd = null;
    this._buzzing = false;

    this._oscillator = new Oscillator();
}

  buzzNextNumber(n) {
    const nextBuzz = this._lastBuzz + n * this._millisPerUnit;
    const buzzInMillis = Math.max(nextBuzz - Date.now(), 0);
    if (this._buzzStart) {
      window.clearTimeout(this._buzzStart);
    }
    this._buzzStart = window.setTimeout(() => {
      this._buzzStart = null;
      this._lastBuzz = nextBuzz;
      // this._oscillator.beep(10);
      if (!this._buzzing) {
        this._buzzing = true;
        this._oscillator.start();
      } else {
        window.clearTimeout(this._buzzEnd);
      }
      this._buzzEnd = window.setTimeout(() => {
        this._buzzing = false;
        this._oscillator.stop();
      }, 10);
    }, buzzInMillis);
  }
}
