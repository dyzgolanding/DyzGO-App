import { useRef } from 'react';
import { Platform } from 'react-native';

export function useMouseScroll(externalRef?: any, snapInterval?: number) {
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

  const snapToNearest = (node: any) => {
    if (!snapInterval) return;
    const nearest = Math.round(node.scrollLeft / snapInterval) * snapInterval;
    node.scrollTo({ left: nearest, behavior: 'smooth' });
  };

  const onMouseDown = (e: any) => {
    const node = getScrollableNode();
    if (!node) return;
    isDown.current = true;
    startX.current = e.pageX - node.offsetLeft;
    scrollLeft.current = node.scrollLeft;
  };

  const onMouseLeave = () => {
    if (!isDown.current) return;
    isDown.current = false;
    const node = getScrollableNode();
    if (node) snapToNearest(node);
  };

  const onMouseUp = () => {
    if (!isDown.current) return;
    isDown.current = false;
    const node = getScrollableNode();
    if (node) snapToNearest(node);
  };

  const onMouseMove = (e: any) => {
    if (!isDown.current || !e.preventDefault) return;
    e.preventDefault();
    const node = getScrollableNode();
    if (!node) return;
    const x = e.pageX - node.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    node.scrollLeft = scrollLeft.current - walk;
  };

  return {
    ref,
    onMouseDown,
    onMouseLeave,
    onMouseUp,
    onMouseMove,
    style: { cursor: isDown.current ? 'grabbing' : 'grab' } as any
  };
}
