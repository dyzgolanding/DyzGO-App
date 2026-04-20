/**
 * Web stub for react-native-pager-view.
 * On web, renders children in a scrollable container instead.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';

function PagerView({ children, style, initialPage = 0, onPageSelected, ...rest }) {
  return React.createElement(
    ScrollView,
    { horizontal: true, pagingEnabled: true, style, showsHorizontalScrollIndicator: false },
    children
  );
}

export default PagerView;
