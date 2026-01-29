import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Pause, Play } from 'lucide-react';
import toast from 'react-hot-toast';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  maxDuration?: number; // in seconds
}

export default function AudioRecorder({ onRecordingComplete, maxDuration = 600 }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
const timerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | undefined>(undefined);


  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const setupAudioVisualization = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 256;
    microphone.connect(analyser);
    
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
      if (analyserRef.current && isRecording) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 255);
        animationRef.current = requestAnimationFrame(updateLevel);
      }
    };
    
    updateLevel();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      setupAudioVisualization(stream);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Check file size (25MB limit)
        if (blob.size > 25 * 1024 * 1024) {
          toast.error('Recording too large. Maximum size is 25MB.');
          return;
        }
        
        onRecordingComplete(blob);
        cleanup();
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            toast.error(`Maximum recording duration of ${maxDuration / 60} minutes reached.`);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        toast('Recording resumed', { icon: '▶️' });
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        toast('Recording paused', { icon: '⏸️' });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      toast.success('Recording stopped');
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setAudioLevel(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Recording Controls */}
      <div className="flex items-center justify-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <Mic className="w-6 h-6" />
            <span>Start Recording</span>
          </button>
        ) : (
          <>
            <button
              onClick={pauseRecording}
              className="flex items-center gap-2 btn-secondary py-3 px-6 rounded-full"
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
            
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-full transition-colors"
            >
              <Square className="w-5 h-5" />
              <span>Stop</span>
            </button>
          </>
        )}
      </div>

      {/* Recording Timer */}
      {isRecording && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 px-4 py-2 rounded-full">
            <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="font-mono text-lg font-semibold text-gray-700">
              {formatTime(recordingTime)}
            </span>
          </div>
        </div>
      )}

      {/* Audio Visualizer */}
      {isRecording && (
        <div className="flex items-center justify-center gap-1 h-20">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="w-2 bg-primary-500 rounded-full transition-all duration-100"
              style={{
                height: `${Math.max(10, audioLevel * 80 * (Math.random() * 0.5 + 0.5))}%`,
                opacity: isPaused ? 0.3 : 1
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}