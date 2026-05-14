"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, RefreshCw, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Example 1: Basic useEffect with cleanup
function TimerExample() {
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  
  useEffect(() => {
    if (!isRunning) return
    
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1)
    }, 1000)
    
    // Cleanup function
    return () => {
      clearInterval(interval)
    }
  }, [isRunning])
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Timer with Cleanup
        </CardTitle>
        <CardDescription>
          useEffect with interval and cleanup function
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <span className="text-4xl font-mono">{seconds}s</span>
          <Button
            variant={isRunning ? "destructive" : "default"}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isRunning ? "หยุด" : "เริ่ม"}
          </Button>
          <Button variant="outline" onClick={() => setSeconds(0)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            รีเซ็ต
          </Button>
        </div>
        
        <pre className="mt-4 bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`useEffect(() => {
  if (!isRunning) return
  
  const interval = setInterval(() => {
    setSeconds((prev) => prev + 1)
  }, 1000)
  
  // Cleanup when isRunning changes or unmount
  return () => clearInterval(interval)
}, [isRunning])`}
        </pre>
      </CardContent>
    </Card>
  )
}

// Example 2: useEffect with dependency array
function WindowSizeExample() {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  
  useEffect(() => {
    // Only runs on client
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    
    // Initial call
    handleResize()
    
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, []) // Empty array = run once on mount
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Window Size Tracker</CardTitle>
        <CardDescription>
          useEffect with event listener and empty dependency array
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <Badge variant="outline" className="text-lg px-4 py-2">
            Width: {windowSize.width}px
          </Badge>
          <Badge variant="outline" className="text-lg px-4 py-2">
            Height: {windowSize.height}px
          </Badge>
        </div>
        
        <pre className="mt-4 bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`useEffect(() => {
  const handleResize = () => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }
  
  handleResize() // Initial call
  window.addEventListener("resize", handleResize)
  
  return () => window.removeEventListener("resize", handleResize)
}, []) // Empty array = mount only`}
        </pre>
      </CardContent>
    </Card>
  )
}

// Example 3: useEffect with useCallback
function SearchExample() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  // Memoized search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }
    
    setIsSearching(true)
    
    // Simulated API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    const mockResults = [
      "วิศวกรรมคอมพิวเตอร์",
      "วิทยาการคอมพิวเตอร์",
      "เทคโนโลยีสารสนเทศ",
      "วิศวกรรมซอฟต์แวร์",
      "ปัญญาประดิษฐ์",
    ].filter((item) => item.includes(searchQuery))
    
    setResults(mockResults)
    setIsSearching(false)
  }, [])
  
  useEffect(() => {
    // Debounce search
    const timeoutId = setTimeout(() => {
      performSearch(query)
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [query, performSearch])
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Debounced Search</CardTitle>
        <CardDescription>
          useEffect with debounce pattern and useCallback
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาสาขาวิชา..."
          className="w-full p-3 rounded-lg bg-muted border-none focus:ring-2 focus:ring-primary"
        />
        
        <div className="mt-4 min-h-[100px]">
          {isSearching ? (
            <p className="text-muted-foreground">กำลังค้นหา...</p>
          ) : results.length > 0 ? (
            <ul className="space-y-2">
              {results.map((result, i) => (
                <li key={i} className="p-2 bg-muted rounded">
                  {result}
                </li>
              ))}
            </ul>
          ) : query ? (
            <p className="text-muted-foreground">ไม่พบผลลัพธ์</p>
          ) : null}
        </div>
        
        <pre className="mt-4 bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`const performSearch = useCallback(async (q) => {
  // ... search logic
}, [])

useEffect(() => {
  const timeoutId = setTimeout(() => {
    performSearch(query)
  }, 300) // Debounce 300ms
  
  return () => clearTimeout(timeoutId)
}, [query, performSearch])`}
        </pre>
      </CardContent>
    </Card>
  )
}

// Example 4: useEffect with abort controller
function FetchExample() {
  const [userId, setUserId] = useState(1)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    const abortController = new AbortController()
    
    const fetchUser = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Simulated API call
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            if (abortController.signal.aborted) {
              reject(new Error("Aborted"))
            } else {
              resolve(null)
            }
          }, 1000)
          
          abortController.signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new Error("Aborted"))
          })
        })
        
        if (!abortController.signal.aborted) {
          setUser({
            name: `User ${userId}`,
            email: `user${userId}@example.com`,
          })
        }
      } catch (err) {
        if (err instanceof Error && err.message !== "Aborted") {
          setError("Failed to fetch user")
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }
    
    fetchUser()
    
    return () => {
      abortController.abort()
    }
  }, [userId])
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fetch with AbortController</CardTitle>
        <CardDescription>
          useEffect with AbortController to cancel ongoing requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map((id) => (
            <Button
              key={id}
              variant={userId === id ? "default" : "outline"}
              onClick={() => setUserId(id)}
            >
              User {id}
            </Button>
          ))}
        </div>
        
        <div className="p-4 bg-muted rounded-lg">
          {loading ? (
            <p className="text-muted-foreground">กำลังโหลด...</p>
          ) : error ? (
            <p className="text-destructive">{error}</p>
          ) : user ? (
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          ) : null}
        </div>
        
        <pre className="mt-4 bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`useEffect(() => {
  const abortController = new AbortController()
  
  const fetchUser = async () => {
    try {
      const res = await fetch(url, {
        signal: abortController.signal
      })
      // ... handle response
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message)
      }
    }
  }
  
  fetchUser()
  
  return () => abortController.abort()
}, [userId])`}
        </pre>
      </CardContent>
    </Card>
  )
}

export default function UseEffectDemoPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">useEffect ตัวอย่างการใช้งาน</h1>
        <p className="text-muted-foreground">
          รวมตัวอย่างการใช้ useEffect ในสถานการณ์ต่างๆ พร้อม cleanup function
        </p>
      </div>
      
      <div className="grid gap-8">
        <TimerExample />
        <WindowSizeExample />
        <SearchExample />
        <FetchExample />
      </div>
    </div>
  )
}
