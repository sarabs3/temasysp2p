/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';
var socket = io.connect();
var userid;
var partnerid;
socket.on('connect',function(){
  socket.emit('user');
});
socket.on('user',function(id){
  userid = id;
  console.log(userid);
});
socket.on('channel created',function(data){
  partnerid = data.partner;
});
var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

var startTime;
var localVideo = document.getElementById('localVideo');
var remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function() {
  trace('Local video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.addEventListener('loadedmetadata', function() {
  trace('Remote video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.onresize = function() {
  trace('Remote video size changed to ' +
    remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    var elapsedTime = window.performance.now() - startTime;
    trace('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
};

var localStream;
var pc1;
var pc2;
var offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

function gotStream(stream) {
  trace('Received local stream');
  localVideo = attachMediaStream(localVideo, stream);
  localStream = stream;
  callButton.disabled = false;
}

function gumFailed(e) {
  alert('getUserMedia() error: ' + e.name);
}

function start() {
  trace('Requesting local stream');
  startButton.disabled = true;
  var constraints = {
    audio: true,
    video: true
  };
  if (typeof Promise === 'undefined') {
    navigator.getUserMedia(constraints, gotStream, gumFailed);
  } else {
    navigator.mediaDevices.getUserMedia(constraints)
    .then(gotStream)
    .catch(gumFailed);
  }
}

function call() {
  socket.emit('startstreaming');
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call');
  startTime = window.performance.now();
  var videoTracks = localStream.getVideoTracks();
  var audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    trace('Using video device: ' + videoTracks[0].label);
  }
  if (audioTracks.length > 0) {
    trace('Using audio device: ' + audioTracks[0].label);
  }
  var servers = null;
  pc1 = new RTCPeerConnection(servers);
  trace('Created local peer connection object pc1');
  pc1.onicecandidate = function(e) {
    onIceCandidate(pc1, e);
  };
  pc2 = new RTCPeerConnection(servers);
  trace('Created remote peer connection object pc2');
  pc2.onicecandidate = function(e) {
    onIceCandidate(pc2, e);
  };
  pc1.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc1, e);
  };
  pc2.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc2, e);
  };
  pc2.onaddstream = gotRemoteStream;

  pc1.addStream(localStream);
  trace('Added local stream to pc1');

  trace('pc1 createOffer start');
  pc1.createOffer(onCreateOfferSuccess, onCreateSessionDescriptionError,
      offerOptions);
}

socket.on('pc2',function(data){
  switch (data.type){
    case 'sdp-offer':
      trace('pc2 setRemoteDescription start');
      console.log(data.sdp);
      pc2.setRemoteDescription(new RTCSessionDescription(data.sdp));
      break;
  }
})

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function onCreateOfferSuccess(desc) {
  trace('Offer from pc1\n' + desc.sdp);
  socket.emit('msg',{by:userid,to:partnerid,sdp:desc,type:'sdp-offer'});
}

socket.on('msg',function(data){
  switch (data.type){
    case 'sdp-offer':
      var sdp = new RTCSessionDescription(data.sdp);
      trace('pc1 setLocalDescription start');
      pc1.setLocalDescription(sdp, function() {
        onSetLocalSuccess(pc1);
      }, onSetSessionDescriptionError);
      trace('pc2 setRemoteDescription start');
      pc2.setRemoteDescription(sdp, function() {
        onSetRemoteSuccess(pc2);
      }, onSetSessionDescriptionError);
      trace('pc2 createAnswer start');
      // Since the 'remote' side has no media stream we need
      // to pass in the right constraints in order for it to
      // accept the incoming offer of audio and video.
      pc2.createAnswer(onCreateAnswerSuccess, onCreateSessionDescriptionError);
      break;
    case 'sdp-answer':
      var sdp = new RTCSessionDescription(data.sdp);
      trace('pc1 setRemoteDescription start');
      pc1.setRemoteDescription(sdp, function() {
        onSetRemoteSuccess(pc1);
      }, onSetSessionDescriptionError);
      break;
    case 'ice':
      if(data.ice){
        var sdp = new RTCSessionDescription(data.sdp);
        getOtherPc(data.pc).addIceCandidate(new RTCIceCandidate(data.ice));
        trace(getName(data.pc) + ' ICE candidate: \n' + data.ice);
      }
      break;
  }
})

function onSetLocalSuccess(pc) {
  trace(getName(pc) + ' setLocalDescription complete');
}

function onSetRemoteSuccess(pc) {
  trace(getName(pc) + ' setRemoteDescription complete');
}

function onSetSessionDescriptionError(error) {
  trace('Failed to set session description: ' + error.toString());
}

function gotRemoteStream(e) {
  remoteVideo = attachMediaStream(remoteVideo, e.stream);
  trace('pc2 received remote stream');
}

function onCreateAnswerSuccess(desc) {
  trace('Answer from pc2:\n' + desc.sdp);
  trace('pc2 setLocalDescription start');
  socket.emit('msg',{by:userid,to:partnerid,sdp:desc,type:'sdp-answer'});
  pc2.setLocalDescription(desc, function() {
    onSetLocalSuccess(pc2);
  }, onSetSessionDescriptionError);
}

function onIceCandidate(pc, event) {
  if (event.candidate) {
    var cand = {"candidate":{}};
    console.log(event.candidate);
     for(var prop in event.candidate){
      if(typeof event.candidate[prop] !== 'function' && typeof event.candidate[prop] !== 'object'){
        cand.candidate[prop] = event.candidate[prop];
      }
     }
    socket.emit('msg', { pc:pc,by: userid, to: partnerid, ice: cand.candidate, type: 'ice' });
  }
}

function onAddIceCandidateSuccess(pc) {
  trace(getName(pc) + ' addIceCandidate success');
}

function onAddIceCandidateError(pc, error) {
  trace(getName(pc) + ' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
  if (pc) {
    trace(getName(pc) + ' ICE state: ' + pc.iceConnectionState);
    console.log('ICE state change event: ', event);
  }
}

function hangup() {
  trace('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}