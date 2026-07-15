import { Text as RNText, TextProps } from 'react-native';
import { Fonts } from '@/constants/theme';

export function Text({ style, ...props }: TextProps) {
  return <RNText style={[{ fontFamily: Fonts.sansRegular, fontSize: 14 }, style]} {...props} />;
}
