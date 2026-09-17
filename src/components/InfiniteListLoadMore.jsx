import { useEffect, useRef, useState } from 'react';
import { Button } from './ui.jsx';

export function useInfiniteList(items, pageSize = 10) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const itemIds = items.map((item) => item.id ?? item.externalKey ?? `${item.club_id}:${item.user_id}`).join(',');

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [itemIds, pageSize]);

  return {
    items: items.slice(0, visibleCount),
    hasMore: items.length > visibleCount,
    loadMore: () => setVisibleCount((count) => count + pageSize),
  };
}

export function InfiniteListLoadMore({ hasMore, onLoadMore, label }) {
  const loadMoreRef = useRef(onLoadMore);
  const triggerRef = useRef(null);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!hasMore || !trigger || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMoreRef.current();
    }, { rootMargin: '240px 0px' });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore]);

  if (!hasMore) return null;

  return (
    <div className="load-more-wrap">
      <div className="load-more-trigger" ref={triggerRef} aria-hidden="true" />
      <Button variant="secondary" onClick={onLoadMore}>{label}</Button>
    </div>
  );
}
