import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, Image, Linking } from 'react-native';
import { Text } from '@/components/Text';
import { SearchInput } from '@/components/SearchInput';
import { Icon } from '@/components/icons/Icon';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import { getMyClub, searchClubRosterPlayers } from '../../lib/club';
import { notifyPaymentApproved, notifyPaymentRejected } from '../../lib/notifications';
import { NoClubPrompt } from '@/components/NoClubPrompt';

const FILTERS: { key: 'pending' | 'paid' | 'rejected' | 'unpaid'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'unpaid', label: 'Unpaid' },
];

const METHODS: { key: 'cash' | 'card' | 'e_transfer' | 'other'; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'e_transfer', label: 'E-transfer' },
  { key: 'other', label: 'Other' },
];

type Payment = {
  id: string;
  player_id: string;
  player_name: string;
  related_to: 'private_lesson' | 'group_tier' | 'other';
  label: string;
  payment_status: 'unpaid' | 'pending' | 'paid' | 'rejected';
  payment_method: string | null;
  payment_proof_url: string | null;
};

type PlayerResult = { id: string; full_name: string };
type RelatedOption = { type: 'private_lesson' | 'group_tier'; id: string; label: string };

export default function PaymentsScreen() {
  const [hasClub, setHasClub] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'paid' | 'rejected' | 'unpaid'>('pending');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([]);
  const [selectedRelated, setSelectedRelated] = useState<RelatedOption | null>(null);
  const [formMethod, setFormMethod] = useState<'cash' | 'card' | 'e_transfer' | 'other'>('cash');
  const [formPaid, setFormPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); return; }
    setHasClub(true);
    setClubId(club.clubId);

    const { data: rows } = await supabase
      .from('lesson_payments')
      .select('*, profiles!lesson_payments_player_id_fkey(full_name), schedule_assignments(coach:profiles!schedule_assignments_coach_id_fkey(full_name)), player_tier_assignments(group_tiers(name))')
      .eq('club_id', club.clubId)
      .order('created_at', { ascending: false });

    setPayments((rows ?? []).map((p: any) => ({
      id: p.id,
      player_id: p.player_id,
      player_name: p.profiles?.full_name ?? 'Player',
      related_to: p.related_to,
      label: p.related_to === 'private_lesson'
        ? `Private lesson with ${p.schedule_assignments?.coach?.full_name ?? 'coach'}`
        : p.related_to === 'group_tier'
        ? (p.player_tier_assignments?.group_tiers?.name ?? 'Group tier')
        : (p.note || 'Payment'),
      payment_status: p.payment_status,
      payment_method: p.payment_method,
      payment_proof_url: p.payment_proof_url,
    })));

    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const searchPlayers = async (q: string) => {
    if (!q.trim() || !clubId) { setPlayerResults([]); return; }
    setPlayerResults(await searchClubRosterPlayers(q, clubId));
  };

  const pickPlayer = async (player: PlayerResult) => {
    setSelectedPlayer(player);
    setSelectedRelated(null);
    const [{ data: lessons }, { data: tiers }] = await Promise.all([
      supabase.from('schedule_assignments').select('id, coach:profiles!schedule_assignments_coach_id_fkey(full_name)').eq('player_id', player.id),
      supabase.from('player_tier_assignments').select('id, group_tiers(name)').eq('player_id', player.id),
    ]);
    const options: RelatedOption[] = [
      ...(lessons ?? []).map((l: any) => ({ type: 'private_lesson' as const, id: l.id, label: `Private lesson with ${l.coach?.full_name ?? 'coach'}` })),
      ...(tiers ?? []).map((t: any) => ({ type: 'group_tier' as const, id: t.id, label: t.group_tiers?.name ?? 'Group tier' })),
    ];
    setRelatedOptions(options);
  };

  const openAddModal = () => {
    setPlayerQuery('');
    setPlayerResults([]);
    setSelectedPlayer(null);
    setRelatedOptions([]);
    setSelectedRelated(null);
    setFormMethod('cash');
    setFormPaid(false);
    setShowModal(true);
  };

  const savePayment = async () => {
    if (!clubId || !selectedPlayer || !selectedRelated) {
      showAlert('Missing info', 'Please pick a player and what the payment is for.');
      return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const payload: any = {
      club_id: clubId,
      player_id: selectedPlayer.id,
      related_to: selectedRelated.type,
      schedule_assignment_id: selectedRelated.type === 'private_lesson' ? selectedRelated.id : null,
      player_tier_assignment_id: selectedRelated.type === 'group_tier' ? selectedRelated.id : null,
      payment_method: formMethod,
      payment_status: formPaid ? 'paid' : 'pending',
    };
    if (formPaid) {
      payload.reviewed_by = session?.user.id;
      payload.reviewed_at = new Date().toISOString();
    }
    const { error } = await supabase.from('lesson_payments').insert(payload);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not create the payment record.'); return; }
    setShowModal(false);
    load();
  };

  const confirm = async (p: Payment) => {
    setBusyId(p.id);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('lesson_payments').update({
      payment_status: 'paid', reviewed_by: session?.user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', p.id);
    await supabase.from('notifications').insert({ user_id: p.player_id, type: 'payment_approved', from_user_id: session?.user.id });
    await notifyPaymentApproved(p.player_id, p.label);
    setBusyId(null);
    load();
  };

  const reject = async (p: Payment) => {
    setBusyId(p.id);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('lesson_payments').update({
      payment_status: 'rejected', reviewed_by: session?.user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', p.id);
    await supabase.from('notifications').insert({ user_id: p.player_id, type: 'payment_rejected', from_user_id: session?.user.id });
    await notifyPaymentRejected(p.player_id, p.label);
    setBusyId(null);
    load();
  };

  const filtered = payments.filter((p) => p.payment_status === filter);

  if (!loading && !hasClub) {
    return (
      <View style={styles.container}>
        <NoClubPrompt />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Payments</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Icon name="plus-circle-outline" size={30} color={Theme.limeAccentDark} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 10, paddingHorizontal: 24 }}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} style={[styles.filterPill, filter === f.key && styles.filterPillActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]} maxFontSizeMultiplier={1.3}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="cloud-upload-outline" size={48} color={Theme.textSecondary} />
            <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.3}>Nothing here right now.</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName}>{p.player_name}</Text>
                <Text style={styles.meta} maxFontSizeMultiplier={1.3}>{p.label}</Text>
                {p.payment_method && <Text style={styles.meta} maxFontSizeMultiplier={1.3}>Method: {METHODS.find((m) => m.key === p.payment_method)?.label ?? p.payment_method}</Text>}
                {p.payment_proof_url && (
                  <TouchableOpacity onPress={() => Linking.openURL(p.payment_proof_url!)}>
                    <Image source={{ uri: p.payment_proof_url }} style={styles.proofThumb} resizeMode="cover" />
                  </TouchableOpacity>
                )}
              </View>
              {p.payment_status === 'pending' ? (
                <View style={styles.actionCol}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(p)} disabled={busyId === p.id}>
                    <Text style={styles.confirmBtnText}>{busyId === p.id ? '...' : 'Confirm'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => reject(p)} disabled={busyId === p.id}>
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              ) : p.payment_status === 'unpaid' ? (
                <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(p)} disabled={busyId === p.id}>
                  <Text style={styles.confirmBtnText}>{busyId === p.id ? '...' : 'Mark Paid'}</Text>
                </TouchableOpacity>
              ) : p.payment_status === 'paid' ? (
                <View style={styles.paidChip}><Icon name="check-circle-outline" size={22} color={Theme.eyebrowGreen} /></View>
              ) : (
                <View style={styles.paidChip}><Icon name="close-circle-outline" size={22} color="#FF6B6B" /></View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Payment Record</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Player</Text>
              {selectedPlayer ? (
                <View style={styles.searchResultRow}>
                  <Text style={styles.playerName}>{selectedPlayer.full_name}</Text>
                  <TouchableOpacity onPress={() => { setSelectedPlayer(null); setRelatedOptions([]); setSelectedRelated(null); }}>
                    <Icon name="close-circle-outline" size={20} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <SearchInput value={playerQuery} onChangeText={(t) => { setPlayerQuery(t); searchPlayers(t); }} placeholder="Search player by name" />
                  {playerResults.map((p) => (
                    <TouchableOpacity key={p.id} style={styles.searchResultRow} onPress={() => pickPlayer(p)}>
                      <Text style={styles.playerName}>{p.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {selectedPlayer && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>What's this payment for?</Text>
                  {relatedOptions.length === 0 ? (
                    <Text style={styles.muted} maxFontSizeMultiplier={1.3}>This player has no lessons or tier assignments yet.</Text>
                  ) : (
                    <View style={styles.pillWrapRow}>
                      {relatedOptions.map((o) => (
                        <TouchableOpacity key={`${o.type}-${o.id}`} style={[styles.pill, selectedRelated?.id === o.id && styles.pillActive]} onPress={() => setSelectedRelated(o)}>
                          <Text style={[styles.pillText, selectedRelated?.id === o.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{o.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Payment method</Text>
              <View style={styles.pillWrapRow}>
                {METHODS.map((m) => (
                  <TouchableOpacity key={m.key} style={[styles.pill, formMethod === m.key && styles.pillActive]} onPress={() => setFormMethod(m.key)}>
                    <Text style={[styles.pillText, formMethod === m.key && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.toggleRow} onPress={() => setFormPaid(!formPaid)}>
                <Icon name={formPaid ? 'check-circle-outline' : 'radiobox-blank'} size={24} color={formPaid ? Theme.eyebrowGreen : Theme.textSecondary} />
                <Text style={styles.toggleLabel}>Already paid — mark as paid immediately</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={savePayment} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Create Payment Record'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { padding: 4 },
  filterScroll: { marginBottom: 12, flexGrow: 0 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  filterPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  filterText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  filterTextActive: { color: '#FFFFFF' },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginVertical: 8 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyDesc: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14, gap: 14 },
  playerName: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  meta: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 3 },
  proofThumb: { width: 72, height: 72, borderRadius: 10, marginTop: 10 },
  actionCol: { alignItems: 'flex-end', gap: 8 },
  confirmBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  confirmBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.limeAccentDark },
  rejectText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#FF6B6B' },
  paidChip: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8, marginTop: 4 },
  formInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary, fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 8 },
  toggleLabel: { flex: 1, fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textPrimary, lineHeight: 20 },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 14, marginBottom: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
});
