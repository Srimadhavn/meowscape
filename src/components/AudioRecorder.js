import React, { useState, useRef } from 'react';
import { Mic, Square, Send, X } from 'lucide-react';
import axios from 'axios';

const AudioRecorder = ({ onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        chunks.current = [];
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const sendAudio = async () => {
    if (!audioBlob) return;

    const formData = new FormData();
    formData.append('audio', audioBlob);

    try {
      const response = await axios.post('/api/upload-audio', formData);
      onSend(response.data.url, 'audio');
      setAudioBlob(null);
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Failed to send audio message');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!audioBlob ? (
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-2 rounded-full ${
            isRecording ? 'bg-red-500' : 'bg-gray-100'
          }`}
        >
          {isRecording ? (
            <Square className="w-5 h-5 text-white" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioBlob(null)}
            className="p-2 bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={sendAudio}
            className="p-2 bg-love text-white rounded-full"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder; 