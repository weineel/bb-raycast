import { useEffect, useRef } from "react";

export function useInitialRequest(start: () => void | Promise<void>, stop: () => void): void {
  const startRef = useRef(start);
  const stopRef = useRef(stop);
  startRef.current = start;
  stopRef.current = stop;

  useEffect(() => {
    let didStart = false;
    const timer = setTimeout(() => {
      didStart = true;
      void startRef.current();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (didStart) stopRef.current();
    };
  }, []);
}
