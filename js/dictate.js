'use strict';

function Dictate(_config) {
  var configDefault = {
    server: 'ws://localhost:6667/query',
    bufferSize: 8192,
    inputChannels: 1,
    outputChannels: 1
  };

  var config = _config;

  // SERVER SETTINGS
  this.server = config.server || configDefault.server

  // AUDIO SETTINGS
  this.bufferSize = config.bufferSize || configDefault.bufferSize;
  this.inputChannels = config.inputChannels || configDefault.inputChannels;
  this.outputChannels = config.outputChannels || configDefault.outputChannels;
  this.sampleRate = 16000;

  // MICROPHONE VARIABLES
  this.recording = false;
  this.requestedAccess = false;
  this.bufferUnusedSamples = new Float32Array(0);
  this.samplesAll = new Float32Array(20000000);
  this.samplesAllOffset = 0;

  // MICROPHONE METHODS
  this.record = function() {
    if (!navigator.mediaDevices.getUserMedia || this.requestedAccess)
      return;

    this.requestedAccess = true;
    console.log('Init recording');
    navigator.mediaDevices.getUserMedia({audio: true})
      .then(this.onMediaStream.bind(this))
      .catch(this.onPermissionRejected.bind(this));
  };

  this.onMediaStream = function(stream) {
    var AudioContext = window.AudioContext || window.webkitAudioContext;

    console.log('Handling media stream');
    if (!AudioContext)
      console.log('AudioContext unavailable');

    if (!this.audioContext)
      this.audioContext = new AudioContext();

    var gain = this.audioContext.createGain();
    var audioInput = this.audioContext.createMediaStreamSource(stream);

    audioInput.connect(gain);

    if(!this.mic) {
      this.mic = this.audioContext.createScriptProcessor(this.bufferSize,
        this.inputChannels, this.outputChannels);
    }

    this.ws = this.createWebSocket();
    this.sampleRate = this.audioContext.sampleRate;

    this.mic.onaudioprocess = this._onaudioprocess.bind(this);
    this.stream = stream;

    gain.connect(this.mic);
    this.mic.connect(this.audioContext.destination);
    this.recording = true;
    this.requestedAccess = false;
  };

  this._onaudioprocess = function(data) {
    if (!this.recording) return;
    var chan = data.inputBuffer.getChannelData(0);
    this.saveData(new Float32Array(chan));
    this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)));
  };

  this.onAudio = function(blob) {
    if (this.ws) {
      var state = this.ws.readyState;
      if (state == 1) {
        console.log('WS send blob ' + blob);
        this.ws.send(blob);
      } else {
        console.log('WS network error');
      }
    }
  };

  this.onPermissionRejected = function(e) {
    this.requestedAccess = false;
    console.log(e);
  };

  this.onError = function(e) {
    config.onError(ERR_CLIENT, e);
  };

  this.stop = function() {
    if (!this.recording) return;
    this.recording = false;
    this.stream.getTracks()[0].stop();
    this.requestedAccess = false;
    this.mic.disconnect(0);
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.closeWebSocket();
  };

  this.closeWebSocket = function() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };

  // UTILITY METHODS
  this.createWebSocket = function() {
    console.log('WS connecting');
    var url = this.server;
    var ws = new WebSocket(url);

    ws.onmessage = function(msg) {
      var data = msg.data;
      if (!(data instanceof Object) || !(data instanceof Blob)) {
        var res = window.JSON.parse(data);
        console.log(res.text);
      } else {
        console.log('WS cannot parse msg');
      }
    };

    ws.onclose = function(msg) {
      var code = msg.code;
      var reason = msg.reason;
      var wasClean = msg.wasClean;
      console.log('ws closed: ' + code + '/' + reason + '/' + wasClean);
    };

    ws.onerror = function(e) {
      console.log('ws error: ' + e.data)
    };

    return ws;
  };

  this.saveData = function(samples) {
    for (var i = 0; i < samples.length; ++i) {
      this.samplesAll[this.samplesAllOffset + i] = samples[i];
    }
    this.samplesAllOffset += samples.length;
    //console.log('samples: ' + this.samplesAllOffset);
  };

  this._exportDataBufferTo16Khz = function(bufferNewSamples) {
    var buffer = null;
    var newSamples = bufferNewSamples.length;
    var unusedSamples = this.bufferUnusedSamples.length;
    var i;

    if (unusedSamples > 0) {
      buffer = new Float32Array(unusedSamples + newSamples);
      for (i = 0; i < unusedSamples; ++i) {
        buffer[i] = this.bufferUnusedSamples[i];
      }
      for (i = 0; i < newSamples; ++i) {
        buffer[unusedSamples + i] = bufferNewSamples[i];
      }
    } else {
      buffer = bufferNewSamples;
    }

    var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675,
      -0.056487, -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527,
      -0.0040653, -0.056487, -0.058675, 0.0047792, 0.019989, 0.040173,
      -0.00089024, -0.037935
    ];
    var samplingRateRatio = this.sampleRate / 16000;
    var nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1;
    var pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2);
    var dataView16k = new DataView(pcmEncodedBuffer16k);
    var index = 0;
    var volume = 0x7FFF;
    var nOut = 0;

    for (i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
      var sample = 0;
      for (var j = 0; j < filter.length; ++j) {
        sample += buffer[i + j] * filter[j];
      }
      sample *= volume;
      dataView16k.setInt16(index, sample, true); // 'true' -> little endian
      index += 2;
      nOut++;
    }

    var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
    var remaining = buffer.length - indexSampleAfterLastUsed;
    if (remaining > 0) {
      this.bufferUnusedSamples = new Float32Array(remaining);
      for (i = 0; i < remaining; ++i) {
        this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
      }
    } else {
      this.bufferUnusedSamples = new Float32Array(0);
    }

    return new Blob([dataView16k], {type: 'audio/l16'});
  };
}
