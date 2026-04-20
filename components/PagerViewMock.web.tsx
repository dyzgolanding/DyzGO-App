import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View, StyleSheet } from 'react-native';

const PagerViewMock = forwardRef((props: any, ref) => {
  const [activePage, setActivePage] = useState(0);

  useImperativeHandle(ref, () => ({
    setPage: (index: number) => {
      setActivePage(index);
      if (props.onPageSelected) {
        props.onPageSelected({ nativeEvent: { position: index } });
      }
    },
    setPageWithoutAnimation: (index: number) => {
      setActivePage(index);
      if (props.onPageSelected) {
        props.onPageSelected({ nativeEvent: { position: index } });
      }
    }
  }));

  const childrenArray = React.Children.toArray(props.children);
  const activeChild = childrenArray[activePage];

  return (
    <View style={[styles.container, props.style]}>
      {activeChild}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  }
});

export default PagerViewMock;
