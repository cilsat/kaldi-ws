// Global UI elements:
//  - log: event log
//  - trans: transcription window

// Global objects:
//  - tt: simple structure for managing the list of hypotheses
//  - dictate: dictate object with control methods 'init', 'startListening', ...
//       and event callbacks onResults, onError, ...
var tt = new Transcription();

var cfgMic = {
    recorderWorkerPath : 'js/recorderWorker.js',
    onReadyForSpeech : function() {
        __message("READY FOR SPEECH");
        __status("Mendengarkan dan mentranskripsi ...");
    },
    onEndOfSpeech : function() {
        __message("END OF SPEECH");
        __status("Mentrankripsi...");
    },
    onEndOfSession : function() {
        __message("END OF SESSION");
        __status("");
    },
    onServerStatus : function(json) {
        __serverStatus(json.num_workers_available + ':' + json.num_requests_processed);
        if (json.num_workers_available == 0) {
            $("#buttonStart").prop("disabled", true);
            $("#serverStatusBar").addClass("highlight");
        } else {
            $("#buttonStart").prop("disabled", false);
            $("#serverStatusBar").removeClass("highlight");
        }
    },
    onPartialResults : function(hypos) {
        // TODO: demo the case where there are more hypos
        tt.add(hypos[0].transcript, false);
        __updateTranscript(tt.toString());
    },
    onResults : function(hypos) {
        // TODO: demo the case where there are more results
        tt.add(hypos[0].transcript, true);
        __updateTranscript(tt.toString());
        // diff() is defined only in diff.html
        if (typeof(diff) == "function") {
            diff();
        }
    },
    onError : function(code, data) {
        __error(code, data);
        __status("Error: " + code);
        this.cancel();
    },
    onEvent : function(code, data) {
        __message(code, data);
    }
};

var dictate = new Dictate();

// Private methods (called from the callbacks)
function __message(code, data) {
    log.innerHTML = "msg: " + code + ": " + (data || '') + "\n" + log.innerHTML;
}

function __error(code, data) {
    log.innerHTML = "ERR: " + code + ": " + (data || '') + "\n" + log.innerHTML;
}

function __status(msg) {
    statusBar.innerHTML = msg;
}

function __serverStatus(msg) {
    serverStatusBar.innerHTML = msg;
}

function __updateTranscript(text) {
    $("#trans").val(text);
}

// Public methods (called from the GUI)
function toggleLog() {
    $(log).toggle();
}
function clearLog() {
    log.innerHTML = "";
}

function clearTranscription() {
    tt = new Transcription();
    $("#trans").val("");
}

function toggledictate() {
    $('#buttondictate').toggleClass('active');
    $('#buttonFile').toggleClass('disabled');
    if ($('#buttondictate').hasClass('active')) {
        dictate.record();
    } else {
        dictate.stop();
    }
}

function toggleFile() {
}

function handleFile() {
    $('#buttonSend').toggleClass('hidden');
    $('#buttonPlay').toggleClass('hidden');
    $('#infoFile').toggleClass('hidden');

    var file = document.getElementById('audioFile').files[0];
    if (file) {
        var info;
        if (file.type == 'audio/x-wav') {
            $('#buttonSend').removeClass('disabled');
            $('#buttonPlay').removeClass('disabled');
            info = file.name;
        } else {
            $('#buttonSend').addClass('disabled');
            $('#buttonPlay').addClass('disabled');
            info = 'Unsupported format ' + file.type;
        }
        $('#infoFile').html(info);
    } else {
        console.log($('#audioFile').val());
    }
}

function sendFile() {
    console.log('sending ' + $('#audioFile').val());

    var file = $('#audioFile').get(0).files[0];
    /*var wavBlob = new Blob([file]);
    var wavURL = window.URL.createObjectURL(wavBlob);
    var audio = new Audio();
    audio.src = wavURL;*/

    dictate.send(file);
    /*var chunkSize = 16000;
    var offset = 0;
    var r = new FileReader();

    var readChunk = function(e) {
        if (offset >= file.size) {
            console.log('finished reading');
        }
        if (e.target.error == null) {
            offset += e.target.result.byteLength;
    };

    var fileBlock = function() {
        var blob = file.slice(offset, length+offset);
        r.readAsArrayBuffer(blob);
        */
}

function playFile() {
    console.log('sent ' + $('#audioFile').val());

    var file = $('#audioFile').get(0).files[0];
    var wavBlob = new Blob([file]);
    var wavURL = window.URL.createObjectURL(wavBlob);
    var audio = new Audio();
    audio.src = wavURL;
    audio.play();
}

function cancel() {
    dictate.cancel();
}

function init() {
    dictate.init();
}

function showLog() {
    $('#buttonShowConfig').toggleClass('hidden');
    $('#buttonClearLog').toggleClass('hidden');
    $('#divLog').toggleClass('hidden');
    $('#buttonLog').toggleClass('active');
}

function showConfig() {
    var pp = JSON.stringify(dictate.getConfig(), undefined, 2);
    log.innerHTML = pp + "\n" + log.innerHTML;
    $(log).show();
}

