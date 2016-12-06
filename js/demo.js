// Global UI elements:
//  - log: event log
//  - trans: transcription window

// Global objects:
//  - tt: simple structure for managing the list of hypotheses
//  - dictate: dictate object with control methods 'init', 'startListening', ...
//       and event callbacks onResults, onError, ...

var Transcription = function(cfg) {
    var index = 0;
    var list = [];

    this.add = function(text, isFinal) {
        list[index] = text;
        if (isFinal) {
            index++;
        }
    }

    this.toString = function() {
        return list.join('. ');
    }
};

var tt = new Transcription();

var cfgDictate = {
    onPartialResults : function(hypos) {
        tt.add(hypos[0].transcript, false);
        __updateTranscript(tt.toString());
    },
    onResults : function(hypos) {
        tt.add(hypos[0].transcript, true);
        __updateTranscript(tt.toString());
    }
};

var dictate = new Dictate(cfgDictate);

// Private methods (callbacks)
function __updateTranscript(text) {
    $("#trans").val(text);
    $('#trans').scrollTop($('#trans')[0].scrollHeight);
}

// Public methods (called from the GUI)
function toggleMic() {
    if (!$('#buttonMic').hasClass('disabled')) {
        $('#buttonMic').toggleClass('active');
        $('#buttonFile').toggleClass('disabled');
        if ($('#buttonMic').hasClass('active')) {
            dictate.record();
            $('#textStart').addClass('hidden');
            $('#textMic').removeClass('hidden');
        } else {
            dictate.stop();
            $('#textStart').removeClass('hidden');
            $('#textMic').addClass('hidden');
        }
    }
}

function toggleFile() {
    if (!$('#buttonFile').hasClass('disabled')) {
        $('#buttonFile').toggleClass('active');
        $('#buttonMic').toggleClass('disabled');
        $('#textStart').toggleClass('hidden');
        $('#textFile').toggleClass('hidden');
        $('#buttonBrowse').toggleClass('hidden');
        $('#buttonSend').toggleClass('hidden');
        $('#buttonPlay').toggleClass('hidden');
        $('#infoFile').toggleClass('hidden');

        if ($('#buttonFile').hasClass('active')) {
            dictate.cancel();
        }
    }
}

function handleFile() {
    var file = document.getElementById('audioFile').files[0];
    if (file) {
        var info;
        if (file.type == 'audio/x-wav' || file.type == 'audio/wav') {
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
    if (!$('#buttonSend').hasClass('disabled')) {
        dictate.send($('#audioFile').get(0).files[0]);
    }
}

function playFile() {
    if (!$('#buttonPlay').hasClass('disabled')) {
        var file = $('#audioFile').get(0).files[0];
        var wavBlob = new Blob([file]);
        var wavURL = window.URL.createObjectURL(wavBlob);
        var audio = new Audio();
        audio.src = wavURL;
        audio.play();
    }
}

function saveTranscript() {
    var text = $('#trans').val();
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', 'transcription.txt');
    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();
    document.body.removeChild(element);
};

function clearTranscript() {
    tt = new Transcription();
    $("#trans").val("");
}

window.onload = function() {
    clearTranscript();
    if (!window.AudioContext || !navigator.mediaDevices.getUserMedia) {
        $('#textBrowser').removeClass('hidden');
    }
};

