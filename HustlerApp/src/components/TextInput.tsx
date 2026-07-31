import { TextInput as RNTextInput, TextInputProps, StyleSheet } from 'react-native';

// Wraps RN's TextInput so every text field in the app always shows a visible
// cursor. None of the screens set `cursorColor`/`selectionColor` explicitly,
// so the caret fell back to the platform default, which can end up
// low-contrast (or invisible) against a given input's background. This
// derives the caret color from the input's own `color` style — the same
// color the typed text renders in, so it's guaranteed to be visible — unless
// the caller passes `cursorColor`/`selectionColor` explicitly.
export function TextInput({ style, cursorColor, selectionColor, ...props }: TextInputProps) {
  const flattened = StyleSheet.flatten(style) as { color?: string } | undefined;
  const caret = cursorColor ?? flattened?.color ?? '#1A1A18';
  return (
    <RNTextInput
      style={style}
      cursorColor={caret}
      selectionColor={selectionColor ?? caret}
      {...props}
    />
  );
}
