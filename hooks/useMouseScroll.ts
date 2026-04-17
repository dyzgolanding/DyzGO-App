import { useRef } from 'react';
import { Platform } from 'react-native';

export function useMouseScroll(externalRef?: any) {
  if (Platform.OS !== 'web') return {};

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const internalRef = useRef<any>(null);
  const ref = externalRef || internalRef;

  const getScrollableNode = () => {
    if (!ref.current) return null;
    if (ref.current.getScrollableNode) return ref.current.getScrollableNode();
    if (ref.current.getNode) return ref.current.getNode();
    return ref.current;
  };

  const onMouseDown = (e: any) => {
    const node = getScrollableNode();
    if (!node) return;
    isDown.current = true;
    startX.current = e.pageX - node.offsetLeft;
    scrollLeft.current = node.scrollLeft;
  };

  const onMouseLeave = () => {
    isDown.current = false;
  };

  const onMouseUp = () => {
    isDown.current = false;
  };

  const onMouseMove = (e: any) => {
    if (!isDown.current || !e.preventDefault) return;
    e.preventDefault();
    const node = getScrollableNode();
    if (!node) return;
    const x = e.pageX - node.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Scroll-fast multiplier
    node.scrollLeft = scrollLeft.current - walk;
  };

  return {
    ref,
    onMouseDown,
    onMouseLeave,
    onMouseUp,
    onMouseMove,
    // Provide styles to change the cursor
    style: { cursor: isDown.current ? 'grabbing' : 'grab' } as any
  };
}
