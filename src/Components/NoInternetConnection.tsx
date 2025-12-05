import React from 'react';
import {View, Text, Dimensions, StyleSheet} from 'react-native';
import FastImage from 'react-native-fast-image';

const {width, height} = Dimensions.get('window');

interface NoInternetConnectionProps {
  message?: string;
  textColor?: string;
  fontSize?: number | string;
  iconSize?: number | string;
  marginTop?: number | string;
  height?: number | string;
}

// Helper function to convert percentage strings to actual values
const convertToValue = (value: number | string, dimension: number): number => {
  if (typeof value === 'string' && value.endsWith('%')) {
    const percentage = parseFloat(value.replace('%', ''));
    return (percentage / 100) * dimension;
  }
  return typeof value === 'number' ? value : parseFloat(value);
};

const NoInternetConnection: React.FC<NoInternetConnectionProps> = ({
  message = 'No Internet Connection',
  textColor = '#000',
  fontSize = width * 0.04,
  iconSize = width * 0.05,
  marginTop = height * 0.05,
  height: containerHeight = height * 0.1,
}) => {
  // Convert values to actual numbers
  const actualFontSize = convertToValue(fontSize, width);
  const actualIconSize = convertToValue(iconSize, width);
  const actualMarginTop = convertToValue(marginTop, height);
  const actualHeight = convertToValue(containerHeight, height);

  return (
    <View
      style={[
        styles.container,
        {
          height: actualHeight,
          marginTop: actualMarginTop,
        },
      ]}>
      <Text
        style={[
          styles.text,
          {
            fontSize: actualFontSize,
            color: textColor,
          },
        ]}>
        {message}
      </Text>
      <FastImage
        style={[
          styles.icon,
          {
            width: actualIconSize,
            height: actualIconSize,
          },
        ]}
        source={require('../assets/boyAsk.png')}
        resizeMode={FastImage.resizeMode.contain}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '800',
    textAlign: 'center',
  },
  icon: {
    marginTop: 8,
  },
});

export default NoInternetConnection;
