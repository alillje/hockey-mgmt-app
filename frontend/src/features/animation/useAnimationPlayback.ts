import { useEffect, useRef, useState } from "react";

const normalPlaybackRate = 0.85;

export function useAnimationPlayback(duration: number, revision: string) {
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const current = useRef(0);
  function seek(value: number) {
    setPlaying(false);
    current.current = Math.max(0, Math.min(duration, value));
    setSeconds(current.current);
  }
  useEffect(() => {
    current.current = 0;
    setSeconds(0);
    setPlaying(false);
  }, [duration, revision]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const offset = current.current;
    let frame = 0;
    function tick(now: number) {
      const value = Math.min(
        duration,
        offset + ((now - start) / 1000) * normalPlaybackRate * speed,
      );
      current.current = value;
      setSeconds(value);
      if (value >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  return {
    seconds,
    playing,
    speed,
    setSpeed,
    seek,
    toggle: () => {
      if (current.current >= duration) {
        current.current = 0;
        setSeconds(0);
      }
      setPlaying((value) => !value);
    },
  };
}
