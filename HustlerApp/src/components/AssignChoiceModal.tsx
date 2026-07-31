import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';

type OptionButtonProps = {
  icon: any;
  label: string;
  sub: string;
  onPress: () => void;
};

function OptionButton({ icon, label, sub, onPress }: OptionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = pressed || hovered;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.option, active && styles.optionActive]}
    >
      <View style={[styles.optionIconWrap, active && styles.optionIconWrapActive]}>
        <Icon name={icon} size={34} color={active ? Theme.limeAccent : Theme.limeAccentDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
        <Text style={[styles.optionSub, active && styles.optionSubActive]}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={28} color={active ? Theme.limeAccent : Theme.limeAccentDark} />
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectWorkout: () => void;
  onSelectWeeklyPlan: () => void;
};

export default function AssignChoiceModal({ visible, onClose, onSelectWorkout, onSelectWeeklyPlan }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>What would you like to assign?</Text>

          <OptionButton
            icon="clipboard-plus-outline"
            label="Assign Workout"
            sub="Send a single workout or drill"
            onPress={onSelectWorkout}
          />
          <OptionButton
            icon="calendar-week"
            label="Weekly Plan"
            sub="Build a full week of training"
            onPress={onSelectWeeklyPlan}
          />

          <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,40,24,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Theme.cardDark,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  title: { fontFamily: Fonts.serifMedium, fontSize: 25, color: '#FFFFFF', marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: Theme.limeAccent,
    borderRadius: 22,
    padding: 22,
  },
  optionActive: { backgroundColor: Theme.eyebrowGreen },
  optionIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(26,61,39,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconWrapActive: { backgroundColor: 'rgba(198,232,107,0.18)' },
  optionLabel: { fontSize: 21, fontWeight: '700', color: Theme.limeAccentDark },
  optionLabelActive: { color: Theme.limeAccent },
  optionSub: { fontSize: 15, color: Theme.limeAccentDark, opacity: 0.75, marginTop: 3 },
  optionSubActive: { color: Theme.onDarkSecondary },
  cancelBtn: { alignItems: 'center', paddingVertical: 18, marginTop: 4, borderRadius: 16 },
  cancelBtnPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  cancelText: { fontSize: 17, fontWeight: '600', color: Theme.onDarkSecondary },
});
