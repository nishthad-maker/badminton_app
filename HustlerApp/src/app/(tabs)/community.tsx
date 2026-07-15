import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { TOPICS, TOPIC_ICONS, formatTimeAgo, getOrCreateUsername, avatarColorFor } from '../../lib/community';

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
  const [newPostActive, setNewPostActive] = useState(false);

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
      <View style={styles.container}>
        <View style={styles.signInPrompt}>
          <MaterialCommunityIcons name="forum-outline" size={64} color={Theme.eyebrowGreen} />
          <Text style={styles.signInTitle}>Join the Community</Text>
          <Text style={styles.signInDesc}>Sign in to read and post anonymously with other badminton players.</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login' as any)}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>PLAYER FORUM</Text>
          <Text style={styles.title}>Community</Text>
        </View>
        <Pressable
          style={[styles.newPostBtn, newPostActive && styles.newPostBtnActive]}
          onPress={goToNewPost}
          onHoverIn={() => setNewPostActive(true)}
          onHoverOut={() => setNewPostActive(false)}
          onPressIn={() => setNewPostActive(true)}
          onPressOut={() => setNewPostActive(false)}
        >
          <MaterialCommunityIcons name="plus" size={26} color={newPostActive ? '#FFFFFF' : '#534AB7'} />
        </Pressable>
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
              size={17}
              color={activeTopic === topic ? '#FFFFFF' : Theme.textSecondary}
            />
            <Text style={[styles.topicPillText, activeTopic === topic && styles.topicPillTextActive]}>
              {topic}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeTopic === 'Recovery & Wellness' && (
        <View style={styles.disclaimer}>
          <MaterialCommunityIcons name="information-outline" size={19} color={Theme.eyebrowGreen} />
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
            size={16}
            color={sortMode === 'newest' ? '#534AB7' : Theme.textSecondary}
          />
          <Text style={[styles.sortBtnText, sortMode === 'newest' && styles.sortBtnTextActive]}>Newest</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'liked' && styles.sortBtnActive]}
          onPress={() => setSortMode('liked')}
        >
          <MaterialCommunityIcons
            name="heart-outline"
            size={16}
            color={sortMode === 'liked' ? '#534AB7' : Theme.textSecondary}
          />
          <Text style={[styles.sortBtnText, sortMode === 'liked' && styles.sortBtnTextActive]}>Most Liked</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.postList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />
        }
      >
        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="comment-outline" size={48} color={Theme.textSecondary} />
            <Text style={styles.emptyText}>No posts yet in {activeTopic}.</Text>
            <Text style={styles.emptySubtext}>Be the first to start a discussion!</Text>
          </View>
        ) : (
          posts.map((post) => {
            const avatarColor = avatarColorFor(post.user_id);
            return (
            <TouchableOpacity key={post.id} style={styles.postCard} onPress={() => goToThread(post.id)}>
              <View style={styles.postHeader}>
                <View style={[styles.avatarCircle, { backgroundColor: avatarColor.bg }]}>
                  <MaterialCommunityIcons name="account" size={20} color={avatarColor.fg} />
                </View>
                <Text style={styles.postAuthor}>{usernames[post.user_id] ?? 'Player'}</Text>
                <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
              </View>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postBody} numberOfLines={2}>{post.body}</Text>
              <View style={styles.postFooter}>
                <View style={styles.postStat}>
                  <MaterialCommunityIcons name="heart-outline" size={17} color={Theme.textSecondary} />
                  <Text style={styles.postStatText}>{post.likes_count ?? 0}</Text>
                </View>
                <View style={styles.postStat}>
                  <MaterialCommunityIcons name="comment-outline" size={17} color={Theme.textSecondary} />
                  <Text style={styles.postStatText}>{post.reply_count ?? 0}</Text>
                </View>
              </View>
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  eyebrow: { fontSize: 13, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 6 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary },
  newPostBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E3D9F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPostBtnActive: { backgroundColor: '#534AB7' },
  topicRow: { flexGrow: 0, marginBottom: 16, minHeight: 48 },
  topicContent: { gap: 10, paddingRight: 8 },
  topicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: Theme.cardWhite,
  },
  topicPillActive: { backgroundColor: '#534AB7' },
  topicPillText: { color: Theme.textSecondary, fontSize: 15, fontWeight: '600' },
  topicPillTextActive: { color: '#FFFFFF' },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Theme.cardTinted,
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
  },
  disclaimerText: { flex: 1, fontSize: 15, color: Theme.textSecondary, lineHeight: 21 },
  sortRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  sortBtnActive: { borderColor: '#534AB7', backgroundColor: '#E3D9F5' },
  sortBtnText: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600' },
  sortBtnTextActive: { color: '#534AB7' },
  postList: { paddingBottom: 170 },
  postCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.cardTinted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: { fontSize: 15, fontWeight: '600', color: Theme.eyebrowGreen, flex: 1 },
  postTime: { fontSize: 14, color: Theme.textSecondary },
  postTitle: { fontSize: 19, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 6 },
  postBody: { fontSize: 16, color: Theme.textSecondary, lineHeight: 22, marginBottom: 12 },
  postFooter: { flexDirection: 'row', gap: 20 },
  postStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postStatText: { fontSize: 15, color: Theme.textSecondary },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 17, color: Theme.textSecondary, fontStyle: 'italic' },
  emptySubtext: { fontSize: 15, color: Theme.textSecondary },
  signInPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  signInTitle: { fontSize: 26, fontWeight: 'bold', color: Theme.textPrimary, marginTop: 10 },
  signInDesc: { fontSize: 17, color: Theme.textSecondary, textAlign: 'center', lineHeight: 23 },
  signInBtn: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 15,
    marginTop: 10,
  },
  signInBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 16 },
});
