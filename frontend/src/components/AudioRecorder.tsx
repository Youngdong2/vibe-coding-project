import { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 오디오 레벨 분석 설정
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder 설정
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);

        // 스트림 정리
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      };

      mediaRecorder.start(1000); // 1초마다 데이터 수집
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      // 타이머 시작
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // 오디오 레벨 모니터링
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecording) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

    } catch (err) {
      console.error('마이크 접근 오류:', err);
      alert('마이크에 접근할 수 없습니다. 브라우저 설정을 확인해주세요.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setAudioLevel(0);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-recorder">
      <div className="recorder-display">
        <div className="recording-time">{formatTime(recordingTime)}</div>
        {isRecording && (
          <div className="audio-level-container">
            <div
              className="audio-level-bar"
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="recorder-controls">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="record-button"
            disabled={disabled}
          >
            <span className="record-icon" />
            녹음 시작
          </button>
        ) : (
          <>
            {isPaused ? (
              <button onClick={resumeRecording} className="resume-button">
                <span className="resume-icon" />
                계속
              </button>
            ) : (
              <button onClick={pauseRecording} className="pause-button">
                <span className="pause-icon" />
                일시정지
              </button>
            )}
            <button onClick={stopRecording} className="stop-button">
              <span className="stop-icon" />
              녹음 완료
            </button>
          </>
        )}
      </div>

      {isRecording && (
        <div className="recording-indicator">
          <span className={`recording-dot ${isPaused ? 'paused' : ''}`} />
          {isPaused ? '일시정지됨' : '녹음 중...'}
        </div>
      )}
    </div>
  );
}
