import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface AudioPlayerProps {
  src: string;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface AudioPlayerHandle {
  currentTime: number;
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
}

const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(
  ({ src, onTimeUpdate }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Expose audio element to parent
    useImperativeHandle(ref, () => audioRef.current as HTMLAudioElement);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
        setIsLoading(false);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
        onTimeUpdate?.(audio.currentTime);
      };

      const handleEnded = () => {
        setIsPlaying(false);
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleWaiting = () => setIsLoading(true);
      const handleCanPlay = () => setIsLoading(false);

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('waiting', handleWaiting);
      audio.addEventListener('canplay', handleCanPlay);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('waiting', handleWaiting);
        audio.removeEventListener('canplay', handleCanPlay);
      };
    }, [onTimeUpdate]);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;

      audio.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const formatTime = (seconds: number): string => {
      if (!isFinite(seconds)) return '00:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercentage = duration ? (currentTime / duration) * 100 : 0;

    return (
      <div className="custom-audio-player">
        <audio ref={audioRef} src={src} preload="metadata" />

        <button
          className="play-button"
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isLoading ? (
            <span className="loading-icon">...</span>
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="time-display current-time">{formatTime(currentTime)}</div>

        <div className="progress-container" onClick={handleProgressClick}>
          <div className="progress-bar">
            <div
              className="progress-filled"
              style={{ width: `${progressPercentage}%` }}
            />
            <div
              className="progress-handle"
              style={{ left: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="time-display duration">{formatTime(duration)}</div>
      </div>
    );
  }
);

AudioPlayer.displayName = 'AudioPlayer';

export default AudioPlayer;
