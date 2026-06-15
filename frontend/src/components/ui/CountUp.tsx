import { useEffect, useState, useRef } from 'react'

interface CountUpProps {
  end: number
  duration?: number
  className?: string
}

export function CountUp({ end, duration = 600, className }: CountUpProps) {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)
  const startTime = useRef<number>(0)

  useEffect(() => {
    if (end === 0) {
      setCount(0)
      return
    }

    setCount(0) // reset
    startTime.current = 0

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress)
      setCount(Math.floor(eased * end))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [end, duration])

  return <span className={className}>{count}</span>
}
