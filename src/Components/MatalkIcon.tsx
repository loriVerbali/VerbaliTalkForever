import React from 'react';
import {View, StyleSheet, ViewStyle, ImageStyle} from 'react-native';
import FastImage from 'react-native-fast-image';
import matalkImg from '../assets/matalk.png';

interface MatalkIconProps {
  size?: number;
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

const MatalkIcon: React.FC<MatalkIconProps> = ({
  size = 40,
  containerStyle,
  imageStyle,
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      <FastImage
        source={matalkImg}
        style={[styles.icon, {width: size, height: size}, imageStyle]}
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
  icon: {
    // Remove resizeMode from styles as it's handled by the FastImage component
  },
});

export default MatalkIcon;
