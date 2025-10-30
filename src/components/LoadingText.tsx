import { useState, useEffect } from "react";

interface LoadingTextProps {
  messages?: string[];
  interval?: number;
}

const DEFAULT_MESSAGES = [
  "Pace in progress… 🚀",
  "Keeping a steady Pace…",
  "Running at full Pace – almost done!"
];

export const LoadingText = ({ 
  messages = DEFAULT_MESSAGES, 
  interval = 2000 
}: LoadingTextProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, interval);

    return () => clearInterval(timer);
  }, [messages.length, interval]);

  return (
    <span className="inline-block animate-pulse">
      {messages[currentIndex]}
    </span>
  );
};
