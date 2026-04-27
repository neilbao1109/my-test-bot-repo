import { useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';

export default function SearchBar() {
  const {
    showSearch, toggleSearch, searchQuery, setSearchQuery,
    searchResults, searchTotal, searchActiveIdx, setSearchActiveIdx,
    setSearchResults, activeRoomId,
  } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (showSearch) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showSearch]);

  const doSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([], 0);
      return;
    }
    socketService.searchMessages(
      query,
      activeRoomId || undefined,
      false,
      50,
    ).then(({ results, total }) => {
      setSearchResults(results, total);
    });
  }, [activeRoomId, setSearchResults]);

  const handleInput = (value: string) => {
    setSearchQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handlePrev = () => {
    if (searchResults.length === 0) return;
    setSearchActiveIdx(searchActiveIdx > 0 ? searchActiveIdx - 1 : searchResults.length - 1);
  };

  const handleNext = () => {
    if (searchResults.length === 0) return;
    setSearchActiveIdx(searchActiveIdx < searchResults.length - 1 ? searchActiveIdx + 1 : 0);
  };

  // Jump to the active result
  const activeResult = searchResults[searchActiveIdx];
  useEffect(() => {
    // no-op: results are always in current room
  }, [activeResult?.id]);

  if (!showSearch) return null;

  return (
    <div className="flex flex-col border-b border-dark-border bg-dark-surface px-4 py-2 gap-1.5">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery || ''}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search messages..."
          className="flex-1 bg-transparent text-sm text-dark-text placeholder-dark-muted focus:outline-none"
        />
        {/* No scope toggle - search is current room only */}
        <button
          onClick={toggleSearch}
          className="text-dark-muted hover:text-dark-text p-1 flex-shrink-0"
        >
          ✕
        </button>
      </div>
      {/* Results nav */}
      {searchQuery && (
        <div className="flex items-center gap-2 text-xs text-dark-muted">
          {searchResults.length > 0 ? (
            <>
              <span>{searchActiveIdx + 1} / {searchTotal}</span>
              <button onClick={handlePrev} className="hover:text-dark-text px-1">▲</button>
              <button onClick={handleNext} className="hover:text-dark-text px-1">▼</button>
            </>
          ) : (
            <span>No results</span>
          )}
        </div>
      )}
    </div>
  );
}
