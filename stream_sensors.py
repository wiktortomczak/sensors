#!/usr/bin/env python

"""USB -> HTTP forwarding proxy.

Reads sensor readings from USB (or any device file) and streams them via HTTP
(via a built-in HTTP server).

Sample usage:

$ stream_sensors.py --sensors=touch+sound:/dev/ttyUSB0:readings-per-line,imu:/dev/ttyUSB1:readings-per-line

Testing:

In place of real USB device(s), fake readings can be generated, eg.

$ ./fake_readings.sh | ./stream_sensors.py --sensors=touch:/dev/stdin:readings-per-line

HTTP output can be tested with any HTTP client, eg. curl

$ curl -v localhost:9000/
$ curl -v localhost:9000/touch
"""

import collections
import itertools
import json
import Queue
import sys
import time
import threading
import wsgiref.simple_server
import SocketServer

import gflags
import serial


gflags.DEFINE_list('sensors', None, (
  'List of sensor specs to read and forward, comma separated. See usage.'))
gflags.DEFINE_integer('port', 9000, 'TCP port to listen for HTTP connections.')
FLAGS = gflags.FLAGS


def main():
  gflags.FLAGS(sys.argv)
  SensorStreamer.CreateAndServeForever(
    [SensorSet.FromSpec(spec) for spec in FLAGS.sensors],
    FLAGS.port)


class SensorStreamer(object):

  @classmethod
  def CreateAndServeForever(cls, sensor_sets, port):
    streamer = cls(sensor_sets)
    wsgiref.simple_server.make_server(
      '', port, streamer, ThreadingWSGIServer).serve_forever()

  def __init__(self, sensor_sets):
    self._sensors = Dicts.Merge([s.sensors for s in sensor_sets])

  def __call__(self, environ, start_response):
    print '### begin %s %s' % (environ['REQUEST_METHOD'], environ['PATH_INFO'])
    try:
      if environ['REQUEST_METHOD'] == 'GET':
        return self._HandleGETRequest(environ, start_response)
      elif environ['REQUEST_METHOD'] == 'OPTIONS':
        return self._HandleOPTIONSRequest(environ, start_response)
      else:
        start_response('404 Not Found', ())
        return ()
    finally:
      print '### end %s %s' % (environ['REQUEST_METHOD'], environ['PATH_INFO'])

  def _HandleGETRequest(self, environ, start_response):
    if environ['PATH_INFO'] == '/':
      response = json.dumps(self._sensors.keys())
    else:
      sensor = environ['PATH_INFO'].lstrip('/')
      response = itertools.imap(
        lambda event: json.dumps(event) + '\n',
        iter(self._sensors[sensor]))
    start_response('200 OK', [
      ('Content-Type', 'text/plain'),  # TODO
      ('Access-Control-Allow-Origin', '*')
    ])
    return response

  def _HandleOPTIONSRequest(self, environ, start_response):
    start_response('204 No Content', [
      ('Access-Control-Allow-Origin', '*'),
      ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
      ('Access-Control-Allow-Headers',
       environ['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])
    ])
    return ()


# www.electricmonk.nl/log/2016/02/15/multithreaded-dev-web-server-for-the-python-bottle-web-framework/
class ThreadingWSGIServer(SocketServer.ThreadingMixIn,
                          wsgiref.simple_server.WSGIServer):
  daemon_threads = True


class SensorSet(object):

  @classmethod
  def FromSpec(cls, spec):
    sensors, path, decoder = spec.split(':')
    sensors = sensors.split('+')
    return cls(path, sensors, Decoder.REGISTRY[decoder])

  def __init__(self, path, sensors, decoder):
    self._path = path
    self._sensors = collections.OrderedDict([
      (sensor, Stream()) for sensor in sensors])    
    self._decoder = decoder
    Threads.Daemon(self._ReadFromPathWriteToStreams)

  @property
  def sensors(self):
    return self._sensors

  def _ReadFromPathWriteToStreams(self):
    while True:
      try:
        if self._path.startswith('/dev/tty'):  # TODO: is serial
          print '### %s trying to connect' % self._path
          f = serial.Serial(port=self._path, baudrate=115200)
          print '### %s connected' % self._path
          f = FileCloseOnReadException(f, self._HandleDisconnect)
        else:
          f = file(self._path)
      except:
        time.sleep(.1)
        continue

      for readings in self._decoder.IterReadings(f):
        for reading, stream in zip(readings, self._sensors.values()):
          stream.Put(dict(reading=reading))

      print '### while end'

  def _HandleDisconnect(self):
    print '### %s disconnected' % self._path
    for stream in self._sensors.values():
      stream.Put(dict(disconnected=True))

  # TODO: is available


class FileCloseOnReadException(object):

  def __init__(self, f, on_exception=None):
    self._f = f
    self._on_exception = on_exception

  def read(self, size=None):
    try:
      if size is not None:
        return self._f.read(size)
      else:
        return self._f.read()
    except:
      if self._on_exception: self._on_exception()
      self._f.close()
      return ''

  def readline(self):
    try:
      return self._f.readline()
    except:
      if self._on_exception: self._on_exception()
      self._f.close()
      return ''    


class Decoder(object):

  def IterReadings(self, f):
    raise NotImplementedError

class ReadingsPerLineDecoder(Decoder):

  def IterReadings(self, f):
    while True:
      line = f.readline()
      print '### line %r' % line
      if line:
        readings = map(int, line.split(','))
        yield readings
      else:
        break

class BytesDecoder(Decoder):

  def IterReadings(self, f):
    while True:
      c = f.read(1)
      if c:
        yield ord(c)
      else:
        break

Decoder.REGISTRY = {
  'readings-per-line': ReadingsPerLineDecoder(),
  'bytes': BytesDecoder()
}


class Stream(object):

  def __init__(self):
    self._on_data = []

  def Put(self, data):
    for callback in self._on_data:
      callback(data)

  def OnData(self, callback):
    self._on_data.append(callback)
    return callback

  def RemoveOnData(self, callback):
    self._on_data.remove(callback)

  def __iter__(self):
    print '### iter begin'
    queue = Queue.Queue()
    on_data = self.OnData(queue.put)
    while True:
      try:
        yield queue.get()
      except:
        print '### iter end'
        self.RemoveOnData(on_data)
        raise


class Threads(object):

  @classmethod
  def Daemon(cls, func, start=True):
    t = threading.Thread(target=func)
    t.daemon = True
    if t:
      t.start()
    return t


class Dicts(object):

  @classmethod
  def Merge(cls, dicts):
    result = {}
    for d in dicts:
      for k, v in d.items():
        result[k] = v
    return result


if __name__ == '__main__':
  main()
