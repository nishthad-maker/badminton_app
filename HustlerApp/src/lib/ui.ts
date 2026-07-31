import { Alert } from 'react-native';

export const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel = 'Delete') => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: confirmLabel === 'Delete' ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
};
