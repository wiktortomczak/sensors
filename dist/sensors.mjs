
const React = window.React;
const ReactDOM = window.ReactDOM;

import Arrays from 'http://localhost:8000/dist/__packages__/base/arrays.mjs';
import assert from 'http://localhost:8000/dist/__packages__/base/assert.mjs';
import Fetch from 'http://localhost:8000/dist/__packages__/base/fetch.mjs';
import {AsyncIterables} from 'http://localhost:8000/dist/__packages__/base/iterables.mjs';

import Audio, {Oscillator, TimeseriesBuzzer} from 'http://localhost:8000/dist/audio.mjs';


function main() {
  const sensors = Fetch.get('http://localhost:9000/').getJson().then(labels => {
    const sensors = labels.map(sensor => (
      Sensor.fromJsonStream(sensor, 'http://localhost:9000/' + sensor)));
    SensorReadingsView.createAndRender(sensors);
  });
}


class Sensor {

  static fromJsonStream(label, uri) {
    return new this(label, Fetch.get(uri).iterJson());
  }

  constructor(label, readingJsonAsyncIter) {
    this._label = label;
    this._reading = null;
    this._onChange = [];
    AsyncIterables.forEach(readingJsonAsyncIter, readingJson => {
      this._reading = 'reading' in readingJson ?
        readingJson['reading'] : null;
      for (const callback of this._onChange) {
        callback();
      }
    });
  }

  get label() { return this._label; }
  get reading() { return this._reading; }

  onChange(callback) {
    this._onChange.push(callback);
    return callback;
  }

  removeOnChange(callback) {
    Arrays.remove(this._onChange, callback);
  }

  // TODO: close fetch / stream?
}

Sensor.MAX_READING = 255;


class SensorReadingsView extends React.Component {

  static createAndRender(sensors) {
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    return ReactDOM.render(React.createElement(this, {sensors}), rootEl);
  }

  render() {
    return Visualization.REGISTRY.map(visualization => (
      React.createElement(SensorReadingsBox, {
        sensorInitial: this.props.sensors[0],
        visualization,
        sensors: this.props.sensors
      })));
  }
}


class SensorReadingsBox extends React.Component {

  constructor(props) {
    super(props);
    this._setSensor(this.props.sensorInitial);
  }

  get _sensors() { return this.props.sensors; }
  get _sensor() { return this.state.sensor; }
  get _sensorReading() { return this.state.sensorReading; }

  _getSensorByLabel(label) {
    return this._sensors.find(s => s.label == label);
  }

  _setSensor(sensor) {
    if (this._onChange) {
      this._sensor.removeOnChange(this._onChange);
    }

    this._initOrSetState({sensor, sensorReading: sensor.reading});
    this._onChange = sensor.onChange(() => {
      this.setState({sensorReading: sensor.reading});
    });
  }

  _initOrSetState(state) {
    if (!this.state) {  // TODO: If is not mounted.
      this.state = state;
    } else {
      this.setState(state);
    }
  }

  render() {
    return React.createElement('div', {className: 'sensor'}, [
      this._sensorReading != null ? [
        React.createElement('select', {
          value: this._sensor.label,
          onChange: e => this._setSensor(this._getSensorByLabel(e.target.value))
        }, this._sensors.map(sensor => (
          React.createElement('option', {value: sensor.label}, sensor.label)))
        ),
        React.createElement('input', {
          type: 'range', value: this._sensorReading, readOnly: true,
          min: 0, max: Sensor.MAX_READING
        }),
        React.createElement('span', {}, this._sensorReading),
        React.createElement(
          this.props.visualization, {sensorReading: this._sensorReading})
      ] : `waiting for ${this._sensor.label} sensor data`
    ]);
  }
}


class Visualization extends React.Component {

  get _sensorReading() { return this.props.sensorReading; }
}

Visualization.REGISTRY = [];


Visualization.REGISTRY.push(class Propeller extends Visualization {

  constructor(props) {
    super(props);
    this.state = {propellerRotation: 0, muted: true, inverted: false};
    this._buzzer = new TimeseriesBuzzer(1);
  }

  get _propellerRotation() { return this.state.propellerRotation; }

  componentDidMount() {
    this._rotatePropeller();
  }

  render() {
    return [
      React.createElement('div', {}, [
        React.createElement('input', {
          id: 'muted0',
          type: 'checkbox',
          checked: this.state.muted,
          onChange: e => this.setState({muted: e.target.checked})
        }),
        React.createElement('label', {htmlFor: 'muted0'}, 'muted'),
        React.createElement('input', {
          id: 'inverted0',
          type: 'checkbox',
          checked: this.state.inverted,
          onChange: e => this.setState({inverted: e.target.checked})
        }),
        React.createElement('label', {htmlFor: 'inverted0'}, 'invert')
      ]),

      React.createElement('svg', {}, [
        React.createElement('ellipse', {
          rx: 80, ry: 40,
          transform: `translate(150, 100) rotate(${this._propellerRotation})`
        }),
        React.createElement('circle', {
          cx: 150, cy: 500, r: 200 + this._sensorReading / 2
        }),
        React.createElement('rect', {
          x: 0, y: 280, width: 300, height: 20
        })      
      ])
    ];
  }

  _rotatePropeller() {
    window.setInterval(() => {
      this.setState({propellerRotation: (
        this._propellerRotation + (this._sensorReading || 0)/10) % 360});
    }, 60);
  }

  componentDidUpdate() {
    if (!this.state.muted) {
      const number = !this.state.inverted
              ? this._sensorReading + 50
              : Sensor.MAX_READING - this._sensorReading + 50;
      this._buzzer.buzzNextNumber(number);
    }
  }
});


Visualization.REGISTRY.push(class Circle extends Visualization {

  constructor(props) {
    super(props);
    this.state = {muted: true, inverted: false};
    this._oscillator = new Oscillator();
    this._update();
  }

  render() {
    return [
      React.createElement('div', {}, [
        React.createElement('input', {
          id: 'muted1',
          type: 'checkbox',
          checked: this.state.muted,
          onChange: e => this._handleMuted(e.target.checked)
        }),
        React.createElement('label', {htmlFor: 'muted1'}, 'muted'),
        React.createElement('input', {
          id: 'inverted1',
          type: 'checkbox',
          checked: this.state.inverted,
          onChange: e => this._handleInverted(e.target.checked)
        }),
        React.createElement('label', {htmlFor: 'inverted1'}, 'invert'),
      ]),

      React.createElement('svg', {}, [
        React.createElement('circle', {
          cx: 150, cy: 150, r: 10 + 125 * this._sensorReading / Sensor.MAX_READING})
      ]),
    ];
  }

  componentDidUpdate() {
    this._update();
  }

  _update() {
    const frequency = !this.state.inverted
      ? 100 + this._sensorReading * 5
      : 100 + (Sensor.MAX_READING - this._sensorReading) * 5;
    this._oscillator.setFrequency(frequency);
  }

  _handleMuted(muted) {
    this.setState({muted});
    !muted ? this._oscillator.start() : this._oscillator.stop();
  }

  _handleInverted(inverted) {
    this.setState({inverted});
  }
});


Visualization.REGISTRY.push(class Arm extends Visualization {

  render() {
    return [
      React.createElement('div', {}, [
        React.createElement('input', {type: 'checkbox', style: {visibility: 'hidden'}})
      ]),
      
      React.createElement('svg', {}, [
        React.createElement('path', {
          d: 'M 0 -20 h 100 a 20 20 0 0 1 0 40 h -100 a 20 20 0 0 1 0 -40',
          transform: `translate(150, 150) rotate(${this._sensorReading * 360 / Sensor.MAX_READING})`
        }),
        React.createElement('circle', {
          cx: 150, cy: 150, r: 5, className: 'black'})
      ])      
    ];
  }
});


window.onload = main();
