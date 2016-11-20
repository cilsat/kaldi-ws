'use strict';

var configDefault = {
    server: 'ws://117.102.69.52:8017',
    serverSpeech: '/client/ws/speech',
    serverStatus: '/client/ws/status',
    contentType: 'content-type=audio/x-raw,+layout=(string)interleaved,+rate=(int)16000,+format=(string)S16LE,+channels=(int)1',
    bufferSize: 8192,
    inputChannels: 1,
    outputChannels: 1
};

function Microphone(_config) {
    var config = _config || configDefault;

    this.server = config.server;
    this.serverSpeech = config.serverSpeech;
    this.serverStatus = config.serverStatus;
    this.contentType = config.contentType;
    this.bufferSize = config.bufferSize;
    this.inputChannels = config.inputChannels;
    this.outputChannels = config.outputChannels;
    this.recording = false;
    this.requestedAccess = false;
    this.sampleRate = 16000;

    this.bufferUnusedSamples = new Float32Array(0);
    this.samplesAll = new Float32Array(20000000);
    this.samplesAllOffset = 0;

    if (!navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia;
    }

    this.onPermissionRejected = function(e) {
        this.requestedAccess = false;
        console.log('rejected ' + e);
        //config.onError(ERR_CLIENT, 'Permission to access microphone rejected');
    };

    this.onError = function(e) {
        config.onError(ERR_CLIENT, e);
    };

    this.onMediaStream = function(stream) {
        var AudioContext = window.AudioContext || window.webkitAudioContext;

        console.log('handling media stream');
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

        this.mic.onaudioprocess = this._onaudioprocess.bind(this);
        this.stream = stream;

        gain.connect(this.mic);
        this.mic.connect(this.audioContext.destination);
        this.recording = true;
        this.requestedAccess = false;
        this.onStartRecording();
    };

    this._onaudioprocess = function(data) {
        if (!this.recording) return;
        var chan = data.inputBuffer.getChannelData(0);
        this.saveData(new Float32Array(chan));
        this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)));
    };

    this.record = function() {
        if (!navigator.mediaDevices.getUserMedia || this.requestedAccess)
            return;

        this.requestedAccess = true;
        console.log('init recording');
        navigator.mediaDevices.getUserMedia({audio: true})
            .then(this.onMediaStream.bind(this))
            .catch(this.onPermissionRejected.bind(this));
    };

    this.stop = function() {
        if (!this.recording) return;
        this.recording = false;
        this.stream.getTracks()[0].stop();
        this.requestedAccess = false;
        this.mic.disconnect(0);
        this.onStopRecording();
    };

    this.onStartRecording = function() {
        console.log('start recording');
        var url = this.server + this.serverSpeech + '?' + this.contentType;
        this.ws = new WebSocket(url);

        this.ws.onOpen = function(e) {};

        this.ws.onClose = function(e) {};

        this.ws.onMessage = function(e) {};

        this.ws.onError = function(e) {};
        
        return ws;
    };
    
    this.onStopRecording = function() {
        console.log('stop recording'); 
    };

    this.onAudio = function(blob) {
        console.log('audio samples: ' + blob.size);
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
            -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
            -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
            -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
        ];
        var samplingRateRatio = this.audioContext.sampleRate / 16000;
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

