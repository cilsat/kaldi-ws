'use strict';

function Dictate(_config) {
    var configDefault = {
        server: 'ws://117.102.69.52:8017',
        serverSpeech: '/client/ws/speech',
        serverStatus: '/client/ws/status',
        contentType: 'content-type=audio/x-raw,+layout=(string)interleaved,+rate=(int)16000,+format=(string)S16LE,+channels=(int)1',
        bufferSize: 8192,
        inputChannels: 1,
        outputChannels: 1
    };

    var config = _config || configDefault;

    // server settings
    this.server = config.server;
    this.serverSpeech = config.serverSpeech;
    this.serverStatus = config.serverStatus;

    // audio settings
    this.contentType = config.contentType;
    this.bufferSize = config.bufferSize;
    this.inputChannels = config.inputChannels;
    this.outputChannels = config.outputChannels;
    this.sampleRate = 16000;

    // microphone/recording settings
    this.recording = false;
    this.requestedAccess = false;
    this.bufferUnusedSamples = new Float32Array(0);
    this.samplesAll = new Float32Array(20000000);
    this.samplesAllOffset = 0;

    // file settings
    this.sending = false;
    this.samplesOffset = 0;
    this.chunkSize = 16000;

    // file methods
    this.send = function(file) {
        this.contentType = 'content-type=audio/x-wav';
        this.createWebSocket();
        this.audioFile = new Blob([file]);
        this.samplesOffsetoffset = 0;
        this.chunkSize = 16000;

        var onData = function(data) {
            this.ws.send(data);
        };

        var onClose = function() {
            this.ws.close();
        };

        var onReadChunk = function(e) {
            if (e.target.error == null) {
                offset += chunkSize;
                ws.send(e.target.result);
            }
            if (offset >= audioFile.size) {
                console.log('finished reading');
                ws.close();
                return;
            }
            readChunks(offset, chunkSize, audioFile);
        };

        var readChunks = function(_offset, length, _file) {
            var reader = new FileReader();
            var blob = _file.slice(_offset, _offset + length);
            reader.onload = onReadChunk.bind(this);
            reader.readAsArrayBuffer(blob);
        };

        this.readChunks();

        console.log('sending file');
    };

    this.onReadChunk = function(e) {
        console.log(audioFile.size);
        if (this.samplesOffset >= audioFile.size) {
            console.log('file end');
            this.ws.close();
            this.ws = null;
            return;
        }

        if (e.target.error == null) {
            this.samplesOffset += e.target.result.byteLength;
            //this.ws.send(e.target.result);
        } else {
            console.log(e.target.error);
        }

        this.readChunks();
    };

    this.readChunks = function() {
        this.reader = new FileReader();
        var blob = this.audioFile.slice(this.samplesOffset,
            this.samplesOffset + this.chunkSize);
        this.reader.onload = this.onReadChunk.bind(this);
        this.reader.readAsArrayBuffer(blob);
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

        this.createWebSocket();

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

    this.onAudio = function(blob) {
        if (this.ws) {
            var state = this.ws.readyState;
            if (state == 1) {
                this.ws.send(blob);
                console.log('ws send blob ' + blob.size);
            } else {
                console.log('ws network error');
            }
        }
    };

    this.onPermissionRejected = function(e) {
        this.requestedAccess = false;
        console.log('rejected ' + e);
        //config.onError(ERR_CLIENT, 'Permission to access microphone rejected');
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
        this.onStopRecording();
    };

    this.onStartRecording = function() {
        console.log('start recording');
    };

    this.onStopRecording = function() {
        console.log('stop recording');
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    };

    this.createWebSocket = function() {
        console.log('ws connecting');
        var url = this.server + this.serverSpeech + '?' + this.contentType;
        this.ws = new WebSocket(url);

        this.ws.onmessage = function(msg) {
            var data = msg.data;
            if (!(data instanceof Object) || !(data instanceof Blob)) {
                var res = JSON.parse(data);
                if (res.status == 0) {
                    console.log('final: ' + res.result.hypotheses[0].transcript);
                } else {
                    console.log('partial: ' + res.result.hypotheses[0].transcript);
                }
            } else {
                console.log('ws cannot parse msg');
            }
        };

        this.ws.onclose = function(msg) {
            var code = msg.code;
            var reason = msg.reason;
            var wasClean = msg.wasClean;
            console.log('ws closed: ' + code + '/' + reason + '/' + wasClean);
        };

        this.ws.onerror = function(e) {
            console.log('ws error: ' + e.data)
        };
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

function KaldiWebSocket(url) {
    console.log('ws connecting');
    this.ws = new WebSocket(url);

    ws.onmessage = function(msg) {
        var data = msg.data;
        if (!(data instanceof Object) || !(data instanceof Blob)) {
            var res = JSON.parse(data);
            if (res.status == 0) {
                console.log('final: ' + res.result.hypotheses[0].transcript);
            } else {
                console.log('partial: ' + res.result.hypotheses[0].transcript);
            }
        } else {
            console.log('ws cannot parse msg');
        }
    };

    this.ws.onclose = function(msg) {
        var code = msg.code;
        var reason = msg.reason;
        var wasClean = msg.wasClean;
        console.log('ws closed: ' + code + '/' + reason + '/' + wasClean);
    };

    this.ws.onerror = function(e) {
        console.log('ws error: ' + e.data)
    };
};

