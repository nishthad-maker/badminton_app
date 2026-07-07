import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { TOPICS, TOPIC_ICONS, formatTimeAgo, getOrCreateUsername } from '../../lib/community';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

type SortMode = 'newest' | 'liked';

export default function CommunityScreen() {
  // If we arrive with a topic (e.g. right after creating a post), open on it
  // instead of always defaulting to the first tab.
  const { topic: paramTopic } = useLocalSearchParams<{ topic?: string }>();
  const [activeTopic, setActiveTopic] = useState(
    paramTopic && TOPICS.includes(paramTopic) ? paramTopic : TOPICS[0]
  );
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  useEffect(() => {
    init();
  }, []);

  // Keep the active tab in sync if we navigate here with a topic param.
  useEffect(() => {
    if (paramTopic && TOPICS.includes(paramTopic)) {
      setActiveTopic(paramTopic);
    }
  }, [paramTopic]);

  useEffect(() => {
    if (user) loadPosts();
  }, [activeTopic, sortMode, user]);

  // Reload posts when screen comes back into focus (e.g. after liking in thread)
  useFocusEffect(
    useCallback(() => {
      if (user) loadPosts();
    }, [activeTopic, sortMode, user])
  );

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await getOrCreateUsername(session.user.id);
      await checkHiddenPostNotifications(session.user.id);
    } else {
      setLoading(false);
    }
  };

  const checkHiddenPostNotifications = async (userId: string) => {
    const { data: hiddenPosts } = await supabase
      .from('community_posts')
      .select('id, title')
      .eq('user_id', userId)
      .eq('is_hidden', true)
      .eq('owner_notified', false);

    if (hiddenPosts && hiddenPosts.length > 0) {
      const titles = hiddenPosts.map((p: any) => `"${p.title}"`).join(', ');
      showAlert(
        'Post Removed',
        `Your post ${titles} was removed for violating community guidelines. Please keep posts respectful and on-topic.`
      );

      const ids = hiddenPosts.map((p: any) => p.id);
      await supabase
        .from('community_posts')
        .update({ owner_notified: true })
        .in('id', ids);
    }
  };

  const loadPosts = async () => {
    setLoading(true);
    let query = supabase
      .from('community_posts')
      .select('*')
      .eq('topic', activeTopic)
      .eq('is_hidden', false);

    if (sortMode === 'liked') {
      query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data } = await query;

    if (data) {
      setPosts(data);
      const userIds = [...new Set(data.map((p) => p.user_id))];
      const namesMap: Record<string, string> = {};
      for (const uid of userIds) {
        const { data: u } = await supabase
          .from('usernames')
          .select('username')
          .eq('user_id', uid)
          .single();
        if (u?.username) namesMap[uid] = u.username;
      }
      setUsernames(namesMap);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const goToNewPost = () => {
    if (typeof window !== 'undefined') {
      window.location.href = `/community-post?topic=${encodeURIComponent(activeTopic)}`;
    } else {
      router.push({ pathname: '/community-post', params: { topic: activeTopic } });
    }
  };

  const goToThread = (postId: string) => {
    router.push({ pathname: '/community-thread', params: { postId } });
  };

  if (!user && !loading) {
    return (
      <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
        <View style={styles.signInPrompt}>
          <MaterialCommunityIcons name="forum-outline" size={56} color={Colors.accent} />
          <Text style={styles.signInTitle}>Join the Community</Text>
          <Text style={styles.signInDesc}>Sign in to read and post anonymously with other badminton players.</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login' as any)}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
        <TouchableOpacity style={styles.newPostBtn} onPress={goToNewPost}>
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.topicRow}
        contentContainerStyle={styles.topicContent}
      >
        {TOPICS.map((topic) => (
          <TouchableOpacity
            key={topic}
            style={[styles.topicPill, activeTopic === topic && styles.topicPillActive]}
            onPress={() => setActiveTopic(topic)}
          >
            <MaterialCommunityIcons
              name={TOPIC_ICONS[topic] as any}
              size={14}
              color={activeTopic === topic ? '#FFFFFF' : Colors.textSecondary}
            />
            <Text style={[styles.topicPillText, activeTopic === topic && styles.topicPillTextActive]}>
              {topic}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeTopic === 'Recovery & Wellness' && (
        <View style={styles.disclaimer}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.accent} />
          <Text style={styles.disclaimerText}>
            For sharing wellness routines only — not medical advice. Always consult a doctor for injuries.
          </Text>
        </View>
      )}

      <View style={styles.sortRow}>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'newest' && styles.sortBtnActive]}
          onPress={() => setSortMode('newest')}
        >
          <MaterialCommunityIcons
            name="clock-outline"
            size={13}
            color={sortMode === 'newest' ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.sortBtnText, sortMode === 'newest' && styles.sortBtnTextActive]}>Newest</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'liked' && styles.sortBtnActive]}
          onPress={() => setSortMode('liked')}
        >
          <MaterialCommunityIcons
            name="heart-outline"
            size={13}
            color={sortMode === 'liked' ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.sortBtnText, sortMode === 'liked' && styles.sortBtnTextActive]}>Most Liked</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.postList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} colors={[Colors.accent]} />
        }
      >
        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="comment-outline" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No posts yet in {activeTopic}.</Text>
            <Text style={styles.emptySubtext}>Be the first to start a discussion!</Text>
          </View>
        ) : (
          posts.map((post) => (
            <TouchableOpacity key={post.id} style={styles.postCard} onPress={() => goToThread(post.id)}>
              <View style={styles.postHeader}>
                <View style={styles.avatarCircle}>
                  <MaterialCommunityIcons name="account" size={16} color={Colors.accent} />
                </View>
                <Text style={styles.postAuthor}>{usernames[post.user_id] ?? 'Player'}</Text>
                <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
              </View>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postBody} numberOfLines={2}>{post.body}</Text>
              <View style={styles.postFooter}>
                <View style={styles.postStat}>
                  <MaterialCommunityIcons name="heart-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.postStatText}>{post.likes_count ?? 0}</Text>
                </View>
                <View style={styles.postStat}>
                  <MaterialCommunityIcons name="comment-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.postStatText}>{post.reply_count ?? 0}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary },
  newPostBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicRow: { flexGrow: 0, marginBottom: 12, minHeight: 40 },
  topicContent: { gap: 8, paddingRight: 8 },
  topicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundCard,
  },
  topicPillActive: { backgroundColor: Colors.accent },
  topicPillText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  topicPillTextActive: { color: '#FFFFFF' },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  sortBtnText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  sortBtnTextActive: { color: Colors.accent },
  postList: { paddingBottom: 120 },
  postCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: { fontSize: 12, fontWeight: '600', color: Colors.accent, flex: 1 },
  postTime: { fontSize: 11, color: Colors.textSecondary },
  postTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  postBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 10 },
  postFooter: { flexDirection: 'row', gap: 16 },
  postStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postStatText: { fontSize: 12, color: Colors.textSecondary },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, fontStyle: 'italic' },
  emptySubtext: { fontSize: 12, color: Colors.textSecondary },
  signInPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  signInTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 8 },
  signInDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  signInBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  signInBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
