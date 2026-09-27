import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchCard from './components/SearchCard';
import RecentSearches from './components/RecentSearches';
import StudentInfoGrid from './components/StudentInfoGrid';
import OverallSummaryCard from './components/OverallSummaryCard';
import SemesterCard from './components/SemesterCard';

const RESULT_CACHE_KEY = "jntuh_result_cache";
const MAX_CACHED_RESULTS = 10;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

export default function App() {
  const [htno, setHtno] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [resultData, setResultData] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const getCachedResults = () => {
    try {
      return JSON.parse(localStorage.getItem(RESULT_CACHE_KEY)) || {};
    } catch {
      return {};
    }
  };

  const loadHistory = () => {
    const cache = getCachedResults();
    const sorted = Object.entries(cache)
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .map(([key]) => key);
    setHistory(sorted);
  };

  const saveResultToCache = (searchHtno, data) => {
    if (!data || !data.success) return;
    const cache = getCachedResults();
    cache[searchHtno] = {
      data: data,
      timestamp: Date.now()
    };

    const entries = Object.entries(cache)
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, MAX_CACHED_RESULTS);

    const limitedCache = Object.fromEntries(entries);
    localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(limitedCache));
    loadHistory();
  };

  const removeResultFromCache = (searchHtno) => {
    const cache = getCachedResults();
    if (cache[searchHtno]) {
      delete cache[searchHtno];
      localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(cache));
      loadHistory();
    }
  };

  const getCachedResult = (searchHtno) => {
    const cache = getCachedResults();
    const cached = cache[searchHtno];
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION) {
      delete cache[searchHtno];
      localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return cached.data;
  };

  const handleClearHistory = () => {
    localStorage.removeItem(RESULT_CACHE_KEY);
    setHistory([]);
    setResultData(null);
  };

  const handleSearch = async (targetHtno, forceRefresh = false) => {
    const cleanHtno = targetHtno.trim().toUpperCase();
    if (!cleanHtno) {
      setStatus({ type: 'error', message: 'Please enter your Hall Ticket Number.' });
      return;
    }

    setResultData(null);
    setStatus({ type: '', message: '' });

    /* LocalStorage cache check */
    if (!forceRefresh) {
      const cached = getCachedResult(cleanHtno);
      if (cached) {
        console.log("LOCAL CACHE HIT (REACT):", cleanHtno);
        setResultData(cached);
        return;
      }
    }

    console.log("LOCAL CACHE MISS (REACT):", cleanHtno);
    setStatus({ type: 'loading', message: 'Fetching all semester results from JNTUH...' });

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
    try {
      const response = await fetch(`${API_BASE_URL}/api/result?htno=${encodeURIComponent(cleanHtno)}`);
      
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Backend server at '${API_BASE_URL || 'Vercel'}' returned HTML instead of JSON. Please verify your live backend URL and set VITE_API_BASE_URL in Vercel settings.`);
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        removeResultFromCache(cleanHtno);
        throw new Error(data.message || 'Invalid Hall Ticket Number.');
      }

      saveResultToCache(cleanHtno, data);
      setResultData(data);
      setStatus({ type: '', message: '' });
    } catch (err) {
      console.error(err);
      removeResultFromCache(cleanHtno);
      let msg = err.message || 'Something went wrong.';
      if (err.name === 'TypeError' || msg.includes('Failed to fetch')) {
        msg = `Unable to connect to backend API server at ${API_BASE_URL}. Please verify your backend server is live and VITE_API_BASE_URL is set correctly in Vercel settings.`;
      }
      setStatus({ type: 'error', message: msg });
    }
  };

  const handleSelectHistory = (selectedHtno) => {
    setHtno(selectedHtno);
    handleSearch(selectedHtno);
  };

  return (
    <div className="app">
      <Header />
      <main>
        <div className="content">
          <div className="layout-container">
            <div className="main-column">
              <SearchCard
                htno={htno}
                setHtno={setHtno}
                status={status}
                onSearch={(val) => handleSearch(val)}
              />

              {resultData && (
                <div id="result" className="result">
                  <div className="all-results">
                    <div className="result-card" style={{ marginBottom: "20px" }}>
                      <StudentInfoGrid details={resultData.details} defaultHtno={resultData.htno} />
                    </div>
                    <OverallSummaryCard summary={resultData.overallSummary} />
                    <div className="semesters-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      {resultData.semesters?.map((sem, index) => (
                        <SemesterCard key={sem.semester || index} semester={sem} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <RecentSearches
              history={history}
              onSelect={handleSelectHistory}
              onClear={handleClearHistory}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
