'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type RecorderState = 'idle' | 'recording' | 'preview';

interface VoiceMessageRecorderProps {
  onSend: (audioBlob: Blob) => Promise<void>;
  disabled?: boolean;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceMessageRecorder({ onSend, disabled }: VoiceMessageRecorderProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide button if MediaRecorder is not supported
  if (typeof window !== 'undefined' && !navigator.mediaDevices) {
    return null;
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setObjectUrl(url);
        setRecorderState('preview');
      };

      mediaRecorder.start();
      setElapsedSeconds(0);
      setRecorderState('recording');

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          if (prev >= 119) {
            // Auto-stop at 2 minutes
            stopRecording();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        toast.error('Failed to start recording.');
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!audioBlob || isSending) return;
    setIsSending(true);
    try {
      await onSend(audioBlob);
      resetToIdle();
    } catch {
      toast.error('Failed to send voice message. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDiscard = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    resetToIdle();
  };

  const resetToIdle = () => {
    setRecorderState('idle');
    setAudioBlob(null);
    setObjectUrl(null);
    setElapsedSeconds(0);
  };

  if (recorderState === 'idle') {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={startRecording}
        disabled={disabled}
        title="Record voice message"
        aria-label="Record voice message"
      >
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  if (recorderState === 'recording') {
    return (
      <div className="flex items-center gap-2">
        {/* Pulsing red dot */}
        <span className="flex h-3 w-3 items-center justify-center">
          <span className="animate-pulse block h-3 w-3 rounded-full bg-red-500" />
        </span>
        {/* Timer */}
        <span className="text-sm tabular-nums text-muted-foreground min-w-[3rem]">
          {formatTimer(elapsedSeconds)}
        </span>
        {/* Stop button */}
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={stopRecording}
          title="Stop recording"
          aria-label="Stop recording"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Preview state
  return (
    <div className="flex items-center gap-2">
      {objectUrl && (
        <audio
          src={objectUrl}
          controls
          preload="metadata"
          className="h-8 max-w-[180px]"
        />
      )}
      {/* Send button */}
      <Button
        type="button"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={handleSend}
        disabled={isSending}
        title="Send voice message"
        aria-label="Send voice message"
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
      {/* Discard button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
        onClick={handleDiscard}
        disabled={isSending}
        title="Discard recording"
        aria-label="Discard recording"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
